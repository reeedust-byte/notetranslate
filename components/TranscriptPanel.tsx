"use client";

import { useEffect, useRef, useState } from "react";
import { formatMs } from "@/lib/time";
import type { Segment } from "@/lib/types";
import { panel, panelHeader } from "./ui";

interface Props {
  segments: Segment[] | undefined;
  interim: string;
  live: boolean;
  showTranslation: boolean;
  translationAvailable: boolean;
  onToggleTranslation: () => void;
  /** Playback position when replaying, else null. */
  playMs: number | null;
  /** Bumped to scroll a given moment into view (e.g. a citation clicked during recording). */
  focusMs: { ms: number; nonce: number } | null;
  onSeek: (ms: number) => void;
  onQuote: (segment: Segment) => void;
  emptyHint: string;
  className?: string;
}

function segmentAt(segments: Segment[], ms: number): Segment | undefined {
  let found: Segment | undefined;
  for (const s of segments) {
    if (s.startMs <= ms) found = s;
    else break;
  }
  return found;
}

export function TranscriptPanel(props: Props) {
  const { segments, interim, live, showTranslation, translationAvailable, onToggleTranslation, playMs, focusMs, onSeek, onQuote, emptyHint, className } =
    props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [follow, setFollow] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const activeId = playMs !== null && segments ? segmentAt(segments, playMs)?.id : undefined;

  // While recording, keep the newest words in view unless the student scrolled up to reread.
  useEffect(() => {
    const el = scrollRef.current;
    if (live && el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [segments?.length, interim, live]);

  // During playback, follow the segment being played.
  useEffect(() => {
    if (!activeId || !follow) return;
    document.getElementById(`seg-${activeId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeId, follow]);

  useEffect(() => {
    if (!focusMs || !segments) return;
    const seg = segmentAt(segments, focusMs.ms);
    if (!seg) return;
    stickToBottom.current = false;
    document.getElementById(`seg-${seg.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightId(seg.id);
    const timer = setTimeout(() => setHighlightId(null), 2000);
    return () => clearTimeout(timer);
    // Only when a new focus request arrives, not whenever segments change.
  }, [focusMs]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  return (
    <section className={`${panel} ${className ?? ""}`}>
      <div className={panelHeader}>
        <h2 className="text-sm font-semibold">转写</h2>
        {live && (
          <span className="flex items-center gap-1 text-xs text-rec">
            <span className="rec-dot inline-block size-1.5 rounded-full bg-rec" />
            实时
          </span>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          {translationAvailable && (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showTranslation}
                onChange={onToggleTranslation}
                className="accent-[var(--color-accent)]"
              />
              翻译
            </label>
          )}
          {playMs !== null && (
            <label className="flex items-center gap-1.5" title="播放时自动滚动到正在播放的句子">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-[var(--color-accent)]" />
              跟随
            </label>
          )}
        </div>
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {segments && segments.length === 0 && !interim ? (
          <p className="mt-10 px-4 text-center text-sm leading-relaxed text-faint">{emptyHint}</p>
        ) : (
          <ol className="space-y-1">
            {segments?.map((seg) => {
              const active = seg.id === activeId || seg.id === highlightId;
              return (
                <li
                  key={seg.id}
                  id={`seg-${seg.id}`}
                  className={`group relative -mx-2 rounded-lg px-2 py-1.5 transition-colors ${
                    active ? "bg-accent-soft" : "hover:bg-sunk"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSeek(seg.startMs)}
                    className="mr-2 font-mono text-[11px] text-faint tabular-nums hover:text-accent"
                    title="从这里播放"
                  >
                    {formatMs(seg.startMs)}
                  </button>
                  <span className="text-[14.5px] leading-relaxed">{seg.text}</span>
                  {showTranslation && seg.translation && (
                    <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">{seg.translation}</p>
                  )}
                  {showTranslation && translationAvailable && seg.translation === undefined && (
                    <p className="mt-0.5 text-xs text-faint">翻译中…</p>
                  )}
                  <button
                    type="button"
                    onClick={() => onQuote(seg)}
                    className="absolute right-1 top-1 rounded-md border border-line bg-panel px-1.5 py-0.5 text-[11px] text-muted opacity-0 shadow-sm transition group-hover:opacity-100 hover:text-accent focus:opacity-100"
                    title="把这句加到笔记里"
                  >
                    ＋笔记
                  </button>
                </li>
              );
            })}
            {interim && (
              <li className="-mx-2 px-2 py-1.5 text-[14.5px] italic leading-relaxed text-faint">{interim}</li>
            )}
          </ol>
        )}
      </div>
    </section>
  );
}
