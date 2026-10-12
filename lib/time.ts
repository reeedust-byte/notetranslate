/** Formats a lecture timeline position as m:ss, or h:mm:ss past the first hour. */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${String(m).padStart(2, "0")}:${ss}`;
}

/** Parses "mm:ss" or "h:mm:ss" into ms. Returns null for anything else. */
export function parseTimestamp(text: string): number | null {
  const match = /^\s*(\d{1,3}):(\d{2})(?::(\d{2}))?\s*$/.exec(text);
  if (!match) return null;
  const [, a, b, c] = match;
  const parts = c === undefined ? [0, Number(a), Number(b)] : [Number(a), Number(b), Number(c)];
  const [h, m, s] = parts;
  if (s >= 60 || (c !== undefined && m >= 60)) return null;
  return ((h * 60 + m) * 60 + s) * 1000;
}

const TIMESTAMP_RE = /\[(\d{1,3}:\d{2}(?::\d{2})?)\](?!\()/g;

/**
 * Turns "[12:34]" citations in model output into markdown links with a "#t=<ms>" href,
 * so the markdown renderer can make them seek the audio.
 */
export function linkifyTimestamps(markdown: string): string {
  return markdown.replace(TIMESTAMP_RE, (whole, stamp: string) => {
    const ms = parseTimestamp(stamp);
    return ms === null ? whole : `[${stamp}](#t=${ms})`;
  });
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
