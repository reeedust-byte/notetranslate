import { formatDate, formatMs } from "../time";
import type { Digest, Lecture, NoteBlock, Segment } from "../types";

/** The whole lecture as one Markdown document: summary, notes, key points, transcript. */
export function lectureToMarkdown(lecture: Lecture, segments: Segment[], notes: NoteBlock[], digests: Digest[]): string {
  const out: string[] = [`# ${lecture.title}`, ""];
  const meta = [lecture.course, formatDate(lecture.createdAt), `时长 ${formatMs(lecture.durationMs)}`].filter(Boolean);
  out.push(`> ${meta.join(" · ")}`, "");

  if (lecture.summary?.trim()) {
    out.push("## 课堂总结", "", lecture.summary.trim(), "");
  }

  const written = notes.filter((n) => n.text.trim() || n.kind === "star");
  if (written.length > 0) {
    out.push("## 我的笔记", "");
    for (const n of written) {
      const stamp = n.t === null ? "" : `[${formatMs(n.t)}] `;
      const text = n.text.trim().replace(/\n/g, "\n  ");
      if (n.kind === "star") out.push(`- ${stamp}⭐ ${text || "重点"}`);
      else if (n.kind === "quote") out.push(`- ${stamp}> ${text}`);
      else out.push(`- ${stamp}${text}`);
    }
    out.push("");
  }

  if (digests.length > 0) {
    out.push("## 实时要点", "");
    for (const d of digests) {
      out.push(`### [${formatMs(d.startMs)}–${formatMs(d.endMs)}] ${d.title}`, "");
      for (const p of d.points) out.push(`- ${p}`);
      out.push("");
    }
  }

  if (segments.length > 0) {
    out.push("## 完整转写", "");
    for (const s of segments) {
      out.push(`**[${formatMs(s.startMs)}]** ${s.text}`);
      if (s.translation) out.push(`> ${s.translation}`);
      out.push("");
    }
  }

  return out.join("\n");
}

export function downloadText(filename: string, text: string, type = "text/markdown"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "lecture";
}
