/** Shared Tailwind class strings. */
const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition disabled:opacity-45";

export const btnPrimary = `${btn} bg-accent text-white hover:brightness-110 active:brightness-95`;
export const btnRec = `${btn} bg-rec text-white hover:brightness-110 active:brightness-95`;
export const btnGhost = `${btn} border border-line bg-panel text-ink hover:bg-sunk`;
export const btnQuiet = `${btn} text-muted hover:bg-sunk hover:text-ink`;
export const field =
  "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition focus:border-accent";
export const panel = "min-h-0 flex-col bg-panel";
export const panelHeader = "flex h-11 shrink-0 items-center gap-2 border-b border-line px-4";
