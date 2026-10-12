const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

/** How often MediaRecorder hands over a chunk; chunks are saved right away so a crash loses at most this much. */
const TIMESLICE_MS = 4000;

export function describeMicError(err: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "麦克风只能在 HTTPS 或 localhost 下使用。请通过 HTTPS 访问本应用。";
  }
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "SecurityError") return "麦克风权限被拒绝，请在浏览器设置中允许本站使用麦克风。";
    if (err.name === "NotFoundError") return "没有检测到麦克风。";
    if (err.name === "NotReadableError") return "麦克风被其他应用占用，无法录音。";
  }
  return `无法启动录音：${err instanceof Error ? err.message : String(err)}`;
}

/** Records the microphone with MediaRecorder and measures the input level for a meter. */
export class AudioCapture {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Uint8Array<ArrayBuffer> | null = null;
  private seq = 0;
  private pending: Promise<unknown>[] = [];

  constructor(private readonly onChunk: (blob: Blob, seq: number) => Promise<unknown>) {}

  /** Starts recording and returns the MIME type of the produced audio. */
  async start(): Promise<string> {
    if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("mediaDevices unavailable", "SecurityError");
    if (typeof MediaRecorder === "undefined") throw new Error("此浏览器不支持录音（MediaRecorder）。");

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.pending.push(this.onChunk(event.data, this.seq++));
    };
    this.recorder.start(TIMESLICE_MS);

    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.samples = new Uint8Array(this.analyser.fftSize);
      source.connect(this.analyser);
    } catch {
      // The level meter is cosmetic; recording works without it.
    }

    return this.recorder.mimeType || mimeType || "audio/webm";
  }

  pause(): void {
    if (this.recorder?.state === "recording") {
      this.recorder.requestData();
      this.recorder.pause();
    }
  }

  resume(): void {
    if (this.recorder?.state === "paused") this.recorder.resume();
  }

  /** Input level from 0 to 1. */
  level(): number {
    if (!this.analyser || !this.samples || this.recorder?.state !== "recording") return 0;
    this.analyser.getByteTimeDomainData(this.samples);
    let sum = 0;
    for (const v of this.samples) {
      const x = (v - 128) / 128;
      sum += x * x;
    }
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 4);
  }

  /** Stops recording, waiting until the final chunk has been handed over and saved. */
  async stop(): Promise<void> {
    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    await Promise.allSettled(this.pending);
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.audioContext?.close().catch(() => undefined);
    this.recorder = null;
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
  }
}
