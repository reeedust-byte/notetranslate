"use client";

import type { Playback } from "@/lib/client/usePlayback";
import { formatMs } from "@/lib/time";

interface Props {
  playback: Playback;
  durationMs: number;
  /** Moments to mark on the scrubber: starred notes. */
  stars: number[];
}

const RATES = [0.75, 1, 1.25, 1.5, 2];

export function PlaybackBar({ playback, durationMs, stars }: Props) {
  const { playing, currentMs, rate, toggle, seek, skip, setRate } = playback;
  const total = Math.max(durationMs, 1);

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line bg-panel px-3 py-2 sm:gap-3 sm:px-4">
      <button
        type="button"
        onClick={() => skip(-15_000)}
        className="hidden rounded-md px-1.5 py-1 text-xs text-muted hover:bg-sunk sm:block"
        title="后退 15 秒"
      >
        −15s
      </button>
      <button
        type="button"
        onClick={toggle}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:brightness-110"
        title={playing ? "暂停" : "播放"}
        aria-label={playing ? "暂停" : "播放"}
      >
        {playing ? (
          <svg viewBox="0 0 16 16" className="size-3.5 fill-current">
            <rect x="3" y="2" width="3.5" height="12" rx="1" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="ml-0.5 size-3.5 fill-current">
            <path d="M4 2.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 4 2.5Z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={() => skip(15_000)}
        className="hidden rounded-md px-1.5 py-1 text-xs text-muted hover:bg-sunk sm:block"
        title="前进 15 秒"
      >
        +15s
      </button>
      <span className="w-12 shrink-0 text-right font-mono text-xs text-muted tabular-nums">{formatMs(currentMs)}</span>
      <div className="relative flex-1">
        <input
          type="range"
          min={0}
          max={total}
          step={500}
          value={Math.min(currentMs, total)}
          onChange={(e) => seek(Number(e.target.value))}
          className="relative z-10 w-full accent-[var(--color-accent)]"
          aria-label="播放进度"
        />
        {stars.map((t, i) => (
          <span
            key={i}
            className="pointer-events-none absolute top-[-6px] z-20 -translate-x-1/2 text-[9px]"
            style={{ left: `${(t / total) * 100}%` }}
          >
            ⭐
          </span>
        ))}
      </div>
      <span className="w-12 shrink-0 font-mono text-xs text-faint tabular-nums">{formatMs(durationMs)}</span>
      <select
        value={rate}
        onChange={(e) => setRate(Number(e.target.value))}
        className="rounded-md border border-line bg-panel px-1 py-1 text-xs"
        aria-label="播放速度"
      >
        {RATES.map((r) => (
          <option key={r} value={r}>
            {r}×
          </option>
        ))}
      </select>
    </div>
  );
}
