"use client";

import Dexie from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { downloadText, lectureToMarkdown, safeFilename } from "@/lib/client/export";
import { useLiveDigest, useLiveTranslation } from "@/lib/client/useLiveAI";
import { usePlayback } from "@/lib/client/usePlayback";
import { useRecordingSession, type RecordingSession } from "@/lib/client/useRecordingSession";
import { useSummary } from "@/lib/client/useSummary";
import { db, deleteLecture, loadTakeBlobs, touchLecture } from "@/lib/db";
import { OUTPUT_LANGUAGES, SPEECH_LANGUAGES, sameLanguage } from "@/lib/languages";
import { formatMs } from "@/lib/time";
import type { Lecture, Segment } from "@/lib/types";
import { ChatTab } from "./ai/ChatTab";
import { DigestTab } from "./ai/DigestTab";
import { QuizTab } from "./ai/QuizTab";
import { SummaryTab } from "./ai/SummaryTab";
import { NotesEditor, addNote } from "./NotesEditor";
import { PlaybackBar } from "./PlaybackBar";
import { TranscriptPanel } from "./TranscriptPanel";
import { btnGhost, btnQuiet, btnRec, field, panel, panelHeader } from "./ui";

type AiTab = "digest" | "summary" | "chat" | "quiz";
type MobileTab = "transcript" | "notes" | "ai";

const AI_TABS: { id: AiTab; label: string }[] = [
  { id: "digest", label: "实时要点" },
  { id: "summary", label: "总结" },
  { id: "chat", label: "问答" },
  { id: "quiz", label: "测验" },
];

function byLecture(id: string): [unknown[], unknown[]] {
  return [
    [id, Dexie.minKey],
    [id, Dexie.maxKey],
  ];
}

function LevelMeter({ level }: { level: () => number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setValue(level());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [level]);
  return (
    <div className="flex h-4 items-end gap-[2px]" aria-hidden>
      {[0.08, 0.2, 0.35, 0.5, 0.7].map((threshold, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full transition-colors ${value > threshold ? "bg-rec" : "bg-line"}`}
          style={{ height: `${40 + i * 15}%` }}
        />
      ))}
    </div>
  );
}

function TitleInput({ lecture }: { lecture: Lecture }) {
  const [value, setValue] = useState(lecture.title);
  useEffect(() => setValue(lecture.title), [lecture.title]);
  const save = () => {
    const title = value.trim();
    if (title && title !== lecture.title) void touchLecture(lecture.id, { title });
    else setValue(lecture.title);
  };
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
      }}
      className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1.5 py-1 text-base font-semibold outline-none hover:bg-sunk focus:bg-sunk"
      aria-label="标题"
    />
  );
}

function RecordControls({ session, lecture }: { session: RecordingSession; lecture: Lecture }) {
  const end = () => {
    if (window.confirm("下课了吗？结束录音后会自动生成课堂总结。（之后仍可继续录音）")) void session.stop();
  };
  switch (session.state) {
    case "starting":
      return (
        <button className={btnRec} disabled>
          正在启动…
        </button>
      );
    case "stopping":
      return (
        <button className={btnGhost} disabled>
          正在保存…
        </button>
      );
    case "recording":
      return (
        <>
          <button className={btnGhost} onClick={() => void session.pause()}>
            ❚❚ 暂停
          </button>
          <button className={btnRec} onClick={end} title="结束录音并生成总结">
            ■ 下课
          </button>
        </>
      );
    case "paused":
      return (
        <>
          <button className={btnGhost} onClick={session.resume}>
            ▶ 继续
          </button>
          <button className={btnRec} onClick={end} title="结束录音并生成总结">
            ■ 下课
          </button>
        </>
      );
    default:
      return lecture.status === "draft" ? (
        <button className={btnRec} onClick={() => void session.start()}>
          ● 开始录音
        </button>
      ) : (
        <button className={btnGhost} onClick={() => void session.start()} title="接着录（作为新的一段录音）">
          <span className="text-rec">●</span> 继续录音
        </button>
      );
  }
}

function MoreMenu({ lecture, live, onExport }: { lecture: Lecture; live: boolean; onExport: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const same = sameLanguage(lecture.speechLang, lecture.outputLang);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const downloadAudio = async () => {
    const blobs = await loadTakeBlobs(lecture);
    blobs.forEach((blob, i) => {
      if (blob.size === 0) return;
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const suffix = blobs.length > 1 ? `-${i + 1}` : "";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeFilename(lecture.title)}${suffix}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  };

  const remove = async () => {
    if (window.confirm(`删除「${lecture.title}」？录音、转写、笔记和测验都会被删除，无法恢复。`)) {
      await deleteLecture(lecture.id);
      router.push("/");
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button className={btnQuiet} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="更多设置">
        ⚙︎
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-line bg-panel p-3 shadow-lg">
          <div className="grid gap-3 text-sm">
            <label className="grid gap-1">
              <span className="text-xs text-muted">讲课语言（语音识别）{live ? " · 录音中不可更改" : ""}</span>
              <select
                className={field}
                value={lecture.speechLang}
                disabled={live}
                onChange={(e) => void touchLecture(lecture.id, { speechLang: e.target.value })}
              >
                {SPEECH_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted">笔记 / 总结 / 测验语言</span>
              <select
                className={field}
                value={lecture.outputLang}
                onChange={(e) => void touchLecture(lecture.id, { outputLang: e.target.value })}
              >
                {OUTPUT_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`flex items-center gap-2 ${same ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                disabled={same}
                checked={lecture.translate && !same}
                onChange={(e) => void touchLecture(lecture.id, { translate: e.target.checked })}
                className="accent-[var(--color-accent)]"
              />
              实时翻译转写
            </label>
            <hr className="border-line" />
            <button className={`${btnQuiet} justify-start`} onClick={onExport}>
              导出 Markdown（总结 + 笔记 + 转写）
            </button>
            <button className={`${btnQuiet} justify-start`} disabled={lecture.takes.length === 0 || live} onClick={downloadAudio}>
              下载录音
            </button>
            <button className={`${btnQuiet} justify-start text-bad hover:bg-bad-soft hover:text-bad`} disabled={live} onClick={remove}>
              删除这节课
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LectureWorkspace({ id }: { id: string }) {
  const lecture = useLiveQuery(async () => (await db.lectures.get(id)) ?? null, [id]);
  const segments = useLiveQuery(() => db.segments.where("[lectureId+startMs]").between(...byLecture(id)).toArray(), [id]);
  const notes = useLiveQuery(() => db.notes.where("[lectureId+order]").between(...byLecture(id)).toArray(), [id]);
  const digests = useLiveQuery(() => db.digests.where("[lectureId+startMs]").between(...byLecture(id)).toArray(), [id]);

  const lec = lecture ?? undefined;
  const session = useRecordingSession(lec);
  const live = session.state !== "idle";
  const recording = session.state === "recording";
  const playback = usePlayback(lec, !live);

  const [digestOn, setDigestOn] = useState(true);
  const intervalMs = lec?.demo ? 30_000 : 90_000;
  const digest = useLiveDigest({ lecture: lec, segments, notes, digests, recording, enabled: digestOn, intervalMs });
  const translation = useLiveTranslation(lec, segments);
  const summary = useSummary(lec, segments, notes);

  const [showTranslation, setShowTranslation] = useState(true);
  const [aiTab, setAiTab] = useState<AiTab>("digest");
  const [mobileTab, setMobileTab] = useState<MobileTab>("notes");
  const [focusMs, setFocusMs] = useState<{ ms: number; nonce: number } | null>(null);

  // Notes are stamped with the lecture clock only while a recording session is running.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const stampNow = useCallback(() => (sessionRef.current.state !== "idle" ? sessionRef.current.nowMs() : null), []);

  // Class is over: write the summary once the last words have been transcribed.
  const generateRef = useRef(summary.generate);
  generateRef.current = summary.generate;
  const prevState = useRef(session.state);
  useEffect(() => {
    const ended = prevState.current === "stopping" && session.state === "idle";
    prevState.current = session.state;
    if (!ended) return;
    setAiTab("summary");
    const timer = setTimeout(() => void generateRef.current(), 1500);
    return () => clearTimeout(timer);
  }, [session.state]);

  const seek = useCallback(
    (ms: number) => {
      if (playback.available) playback.seek(ms, true);
      setFocusMs({ ms, nonce: Date.now() });
    },
    [playback],
  );

  const quote = useCallback(
    (seg: Segment) => {
      if (!notes) return;
      const text = showTranslation && seg.translation ? `${seg.text}\n${seg.translation}` : seg.text;
      void addNote(id, notes, "quote", text, seg.startMs);
      setMobileTab("notes");
    },
    [id, notes, showTranslation],
  );

  const exportMarkdown = () => {
    if (!lec) return;
    downloadText(`${safeFilename(lec.title)}.md`, lectureToMarkdown(lec, segments ?? [], notes ?? [], digests ?? []));
  };

  if (lecture === undefined) {
    return <div className="flex h-dvh items-center justify-center text-sm text-faint">加载中…</div>;
  }
  if (lecture === null) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 text-sm text-muted">
        找不到这节课，可能已被删除。
        <Link href="/" className={btnGhost}>
          返回笔记库
        </Link>
      </div>
    );
  }

  const elapsed = live ? session.nowMs() : lecture.durationMs;
  const transcriptEndMs = segments?.at(-1)?.endMs ?? 0;
  const replayMs = playback.available && !live ? playback.currentMs : null;
  const translationAvailable = translation.active;
  const banners = [
    session.error && { tone: "bad", text: session.error },
    session.warning && { tone: "warn", text: session.warning },
    translation.error && { tone: "warn", text: `实时翻译：${translation.error}` },
  ].filter(Boolean) as { tone: "bad" | "warn"; text: string }[];

  const emptyHint = lecture.demo
    ? "这是演示模式：点右上角「开始录音」，会播放一段模拟的英文讲课（不使用麦克风），你可以同时在中间记笔记。"
    : "点右上角「开始录音」，教授讲的内容会实时转写到这里。把设备放在离讲台近一点的位置效果更好。";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-line bg-panel px-2 py-2 sm:px-3">
        <Link href="/" className={`${btnQuiet} px-2`} title="返回笔记库">
          ‹ <span className="hidden sm:inline">笔记库</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TitleInput lecture={lecture} />
          {lecture.course && <span className="hidden shrink-0 text-xs text-faint md:inline">{lecture.course}</span>}
          {lecture.demo && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">演示</span>}
        </div>
        <div className="flex items-center gap-2">
          {recording && !lecture.demo && <LevelMeter level={session.level} />}
          <span
            className={`font-mono text-sm tabular-nums ${recording ? "text-rec" : "text-muted"}`}
            title="录音时长"
          >
            {recording && <span className="rec-dot mr-1.5 inline-block size-2 rounded-full bg-rec" />}
            {formatMs(elapsed)}
          </span>
          <RecordControls session={session} lecture={lecture} />
          <MoreMenu lecture={lecture} live={live} onExport={exportMarkdown} />
        </div>
      </header>

      {banners.map((b, i) => (
        <div
          key={i}
          className={`shrink-0 border-b border-line px-4 py-1.5 text-xs ${b.tone === "bad" ? "bg-bad-soft text-bad" : "bg-star-soft text-ink"}`}
        >
          {b.text}
        </div>
      ))}

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)] lg:divide-x lg:divide-line">
        <TranscriptPanel
          className={mobileTab === "transcript" ? "flex" : "hidden lg:flex"}
          segments={segments}
          interim={session.interim}
          live={recording}
          showTranslation={showTranslation}
          translationAvailable={translationAvailable}
          onToggleTranslation={() => setShowTranslation((v) => !v)}
          playMs={replayMs}
          focusMs={focusMs}
          onSeek={seek}
          onQuote={quote}
          emptyHint={emptyHint}
        />
        <NotesEditor
          className={mobileTab === "notes" ? "flex" : "hidden lg:flex"}
          lectureId={lecture.id}
          notes={notes}
          stampNow={stampNow}
          replayMs={replayMs}
          onSeek={seek}
        />
        <section className={`${panel} ${mobileTab === "ai" ? "flex" : "hidden lg:flex"}`}>
          <div className={`${panelHeader} gap-1 px-2`}>
            {AI_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAiTab(t.id)}
                className={`relative rounded-md px-2.5 py-1 text-sm transition ${
                  aiTab === t.id ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-sunk hover:text-ink"
                }`}
              >
                {t.label}
                {t.id === "digest" && digest.busy && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-accent" />}
                {t.id === "summary" && summary.running && (
                  <span className="rec-dot absolute right-0.5 top-0.5 size-1.5 rounded-full bg-accent" />
                )}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <div className={aiTab === "digest" ? "scroll-thin h-full overflow-y-auto" : "hidden"}>
              <DigestTab
                digests={digests}
                busy={digest.busy}
                error={digest.error}
                enabled={digestOn}
                onToggle={setDigestOn}
                canFlush={digest.canFlush}
                onFlush={digest.flushNow}
                intervalSec={intervalMs / 1000}
                onSeek={seek}
              />
            </div>
            <div className={aiTab === "summary" ? "scroll-thin h-full overflow-y-auto" : "hidden"}>
              <SummaryTab
                text={summary.text}
                running={summary.running}
                error={summary.error}
                hasTranscript={(segments?.length ?? 0) > 0}
                summaryAtMs={lecture.summaryAtMs}
                transcriptEndMs={transcriptEndMs}
                onGenerate={() => void summary.generate()}
                onCancel={summary.cancel}
                onSeek={seek}
              />
            </div>
            <div className={aiTab === "chat" ? "h-full" : "hidden"}>
              <ChatTab lecture={lecture} segments={segments ?? []} notes={notes ?? []} onSeek={seek} />
            </div>
            <div className={aiTab === "quiz" ? "scroll-thin h-full overflow-y-auto" : "hidden"}>
              <QuizTab lecture={lecture} segments={segments ?? []} notes={notes ?? []} recording={live} onSeek={seek} />
            </div>
          </div>
        </section>
      </main>

      {playback.available && !live && (
        <PlaybackBar
          playback={playback}
          durationMs={lecture.durationMs}
          stars={(notes ?? []).filter((n) => n.kind === "star" && n.t !== null).map((n) => n.t!)}
        />
      )}

      <nav className="grid shrink-0 grid-cols-3 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] lg:hidden">
        {(
          [
            ["transcript", "转写"],
            ["notes", "笔记"],
            ["ai", "AI 助手"],
          ] as [MobileTab, string][]
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`py-2.5 text-sm ${mobileTab === tab ? "font-semibold text-accent" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
