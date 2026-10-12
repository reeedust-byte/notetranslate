"use client";

import { formatMs } from "@/lib/time";
import type { Digest } from "@/lib/types";
import { Markdown } from "../Markdown";
import { btnGhost } from "../ui";

interface Props {
  digests: Digest[] | undefined;
  busy: boolean;
  error: string | null;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  canFlush: boolean;
  onFlush: () => void;
  intervalSec: number;
  onSeek: (ms: number) => void;
}

/** Live key-point cards, newest first, so a glance shows what was just covered. */
export function DigestTab({ digests, busy, error, enabled, onToggle, canFlush, onFlush, intervalSec, onSeek }: Props) {
  const cards = digests ? [...digests].reverse() : [];
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          录音时每 {intervalSec} 秒自动提炼要点
        </label>
        <button type="button" className={`${btnGhost} ml-auto px-2 py-1 text-xs`} disabled={!canFlush || busy} onClick={onFlush}>
          立即整理
        </button>
      </div>

      {busy && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-accent/40 px-3 py-2 text-xs text-accent">
          <span className="rec-dot inline-block size-1.5 rounded-full bg-accent" />
          正在整理最新内容…
        </div>
      )}
      {error && <div className="rounded-xl bg-bad-soft px-3 py-2 text-xs text-bad">{error}</div>}

      {cards.length === 0 && !busy ? (
        <p className="px-2 py-10 text-center text-sm leading-relaxed text-faint">
          开始录音后，这里会随着讲课进度出现一张张要点卡片，方便你走神回来时快速跟上。
        </p>
      ) : (
        cards.map((d) => (
          <article key={d.id} className="rounded-xl border border-line bg-panel p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <button type="button" className="ts-chip ml-0" onClick={() => onSeek(d.startMs)}>
                ▸{formatMs(d.startMs)}–{formatMs(d.endMs)}
              </button>
            </div>
            <h3 className="text-sm font-semibold leading-snug">{d.title}</h3>
            <Markdown className="mt-1 text-[13.5px]" text={d.points.map((p) => `- ${p}`).join("\n")} onSeek={onSeek} />
          </article>
        ))
      )}
    </div>
  );
}
