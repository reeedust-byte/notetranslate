import type { Digest, Segment } from "./types";

/** Segments not yet covered by a key-points card. */
export function pendingForDigest(segments: Segment[], digests: Digest[]): Segment[] {
  const coveredUntil = digests.reduce((max, d) => Math.max(max, d.endMs), -1);
  return segments.filter((s) => s.endMs > coveredUntil);
}

/** Whether enough new lecture has accumulated to write the next card. */
export function digestDue(pending: Segment[], intervalMs: number, flush: boolean): boolean {
  if (pending.length === 0) return false;
  const chars = pending.reduce((n, s) => n + s.text.length, 0);
  if (flush) return chars >= 40;
  const span = pending[pending.length - 1].endMs - pending[0].startMs;
  return span >= intervalMs && chars >= 120;
}
