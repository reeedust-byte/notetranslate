/** Live transcription sources: the browser's Web Speech API, or a scripted demo lecture. */

export interface SpeechCallbacks {
  onInterim(text: string): void;
  onFinal(text: string, startMs: number, endMs: number): void;
  /** `fatal` means recognition has stopped for good (recording itself continues). */
  onError(message: string, fatal: boolean): void;
}

export interface SpeechSource {
  start(): void;
  stop(): void;
}

// Minimal typings: the Web Speech API is not in every TypeScript DOM lib.
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { readonly length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return recognitionCtor() !== null;
}

/** Recognition results arrive a little after the words were spoken. */
const RESULT_LAG_MS = 800;
/** Some engines never finalize during continuous speech; force a cut so segments stay short and timestamped. */
const MAX_INTERIM_CHARS = 320;

export class WebSpeechSource implements SpeechSource {
  private recognition: Recognition | null = null;
  private active = false;
  private startTimes = new Map<number, number>();
  private emitted = new Set<number>();
  private recentRestarts: number[] = [];
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly lang: string,
    private readonly clock: () => number,
    private readonly cb: SpeechCallbacks,
  ) {}

  start(): void {
    this.active = true;
    this.launch();
  }

  stop(): void {
    this.active = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    // stop() (not abort()) so speech in flight is still finalized.
    this.recognition?.stop();
    this.cb.onInterim("");
  }

  private launch(): void {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      this.cb.onError("此浏览器不支持语音识别，只会录音。建议使用 Chrome、Edge 或 Safari。", true);
      return;
    }
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    this.startTimes = new Map();
    this.emitted = new Set();

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (!this.startTimes.has(i)) this.startTimes.set(i, Math.max(0, this.clock() - RESULT_LAG_MS));
        if (result.isFinal) {
          if (!this.emitted.has(i) && text.trim()) {
            this.emitted.add(i);
            this.cb.onFinal(text.trim(), this.startTimes.get(i)!, this.clock());
          }
        } else {
          interim += text;
        }
      }
      this.cb.onInterim(interim);
      if (interim.length > MAX_INTERIM_CHARS) rec.stop();
    };

    rec.onerror = (event) => {
      switch (event.error) {
        case "no-speech":
        case "aborted":
          return; // onend restarts
        case "network":
          this.cb.onError("语音识别服务连接失败，正在重试…（Chrome 的语音识别需要能访问 Google 服务）", false);
          return;
        case "not-allowed":
        case "service-not-allowed":
          this.active = false;
          this.cb.onError("语音识别权限被拒绝，只会录音。", true);
          return;
        case "audio-capture":
          this.active = false;
          this.cb.onError("语音识别无法获取麦克风音频，只会录音。", true);
          return;
        case "language-not-supported":
          this.active = false;
          this.cb.onError("浏览器的语音识别不支持所选的讲课语言，只会录音。", true);
          return;
        default:
          this.cb.onError(`语音识别出错（${event.error}），正在重试…`, false);
      }
    };

    rec.onend = () => {
      if (this.recognition !== rec) return;
      this.recognition = null;
      if (!this.active) return;
      // Engines end sessions after silence or a time limit; restart, backing off if it keeps failing.
      const now = Date.now();
      this.recentRestarts = this.recentRestarts.filter((t) => now - t < 10_000);
      this.recentRestarts.push(now);
      const delay = this.recentRestarts.length > 5 ? 3000 : 100;
      this.restartTimer = setTimeout(() => {
        if (this.active) this.launch();
      }, delay);
    };

    this.recognition = rec;
    try {
      rec.start();
    } catch (err) {
      this.cb.onError(`语音识别启动失败：${err instanceof Error ? err.message : String(err)}`, false);
    }
  }
}

/** Plays back a scripted lecture on the session clock, word by word, for demos and testing. */
export class ScriptedSpeech implements SpeechSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly lines: { text: string; startMs: number; endMs: number }[];
  private nextLine = 0;

  constructor(
    script: string[],
    private readonly clock: () => number,
    private readonly cb: SpeechCallbacks,
    wordsPerSecond = 3.2,
    gapMs = 700,
  ) {
    let t = 1000;
    this.lines = script.map((text) => {
      const words = text.split(/\s+/).length;
      const line = { text, startMs: t, endMs: t + (words / wordsPerSecond) * 1000 };
      t = line.endMs + gapMs;
      return line;
    });
  }

  /** Skips lines that were already "spoken" before `ms` (e.g. when resuming a demo). */
  seek(ms: number): this {
    this.nextLine = this.lines.findIndex((l) => l.endMs > ms);
    if (this.nextLine === -1) this.nextLine = this.lines.length;
    return this;
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), 200);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.cb.onInterim("");
  }

  private tick(): void {
    const now = this.clock();
    const line = this.lines[this.nextLine];
    if (!line) {
      this.cb.onInterim("");
      return;
    }
    if (now >= line.endMs) {
      this.cb.onFinal(line.text, line.startMs, line.endMs);
      this.cb.onInterim("");
      this.nextLine++;
    } else if (now >= line.startMs) {
      const words = line.text.split(/\s+/);
      const shown = Math.ceil(((now - line.startMs) / (line.endMs - line.startMs)) * words.length);
      this.cb.onInterim(words.slice(0, shown).join(" "));
    }
  }
}
