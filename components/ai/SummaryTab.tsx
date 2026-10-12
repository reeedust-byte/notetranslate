"use client";

import { useState } from "react";
import { formatMs } from "@/lib/time";
import { Markdown } from "../Markdown";
import { btnGhost, btnPrimary, btnQuiet } from "../ui";

interface Props {
  text: string | null;
  running: boolean;
  error: string | null;
  hasTranscript: boolean;
  /** Lecture position the saved summary covers, and how far the lecture has got since. */
  summaryAtMs: number | undefined;
  transcriptEndMs: number;
  onGenerate: () => void;
  onCancel: () => void;
  onSeek: (ms: number) => void;
}

export function SummaryTab(props: Props) {
  const { text, running, error, hasTranscript, summaryAtMs, transcriptEndMs, onGenerate, onCancel, onSeek } = props;
  const [copied, setCopied] = useState(false);
  const stale = !running && text && summaryAtMs !== undefined && transcriptEndMs - summaryAtMs > 30_000;

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; nothing else to do.
    }
  };

  if (!text && !running) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm leading-relaxed text-muted">
          根据完整转写和你的笔记，生成一份结构化的课堂总结：概览、核心要点、分主题详细笔记、术语表、老师强调的考点，每部分都带可点击回听的时间戳。
        </p>
        <p className="mt-2 text-xs text-faint">下课（结束录音）时会自动生成，也可以随时手动生成。</p>
        {error && <div className="mt-4 rounded-xl bg-bad-soft px-3 py-2 text-xs text-bad">{error}</div>}
        <button className={`${btnPrimary} mt-5`} disabled={!hasTranscript} onClick={onGenerate}>
          ✨ 生成课堂总结
        </button>
        {!hasTranscript && <p className="mt-2 text-xs text-faint">还没有转写内容。</p>}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {running ? (
          <>
            <span className="flex items-center gap-2 text-xs text-accent">
              <span className="rec-dot inline-block size-1.5 rounded-full bg-accent" />
              {text ? "正在撰写…" : "正在阅读整节课…"}
            </span>
            <button className={`${btnQuiet} ml-auto px-2 py-1 text-xs`} onClick={onCancel}>
              停止
            </button>
          </>
        ) : (
          <>
            {summaryAtMs !== undefined && <span className="text-xs text-faint">基于前 {formatMs(summaryAtMs)} 的内容</span>}
            <div className="ml-auto flex gap-1.5">
              <button className={`${btnGhost} px-2 py-1 text-xs`} onClick={copy}>
                {copied ? "已复制" : "复制"}
              </button>
              <button className={`${stale ? btnPrimary : btnGhost} px-2 py-1 text-xs`} onClick={onGenerate} disabled={!hasTranscript}>
                {stale ? "有新内容，更新总结" : "重新生成"}
              </button>
            </div>
          </>
        )}
      </div>
      {error && <div className="mb-3 rounded-xl bg-bad-soft px-3 py-2 text-xs text-bad">{error}</div>}
      {text && <Markdown text={text} onSeek={onSeek} />}
    </div>
  );
}
