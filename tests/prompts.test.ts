import { describe, expect, it } from "vitest";
import { formatNotes, formatTranscript, lectureMaterials, quizPrompt } from "@/lib/server/prompts";
import { lectureToMarkdown } from "@/lib/client/export";
import type { Lecture } from "@/lib/types";

describe("prompt formatting", () => {
  it("timestamps transcript lines the way citations are parsed back", () => {
    expect(formatTranscript([{ startMs: 754_000, endMs: 760_000, text: " Gradient descent " }])).toBe("[12:34] Gradient descent");
    expect(formatTranscript([])).toBe("(empty)");
  });

  it("marks starred, quoted and after-class notes", () => {
    const text = formatNotes([
      { t: 1000, text: "learning rate", kind: "star" },
      { t: 2000, text: "quote", kind: "quote" },
      { t: null, text: "review later", kind: "text" },
      { t: 3000, text: "   ", kind: "text" },
    ]);
    expect(text.split("\n")).toEqual(["[00:01] ⭐ STARRED learning rate", "[00:02] (quoted from transcript) quote", "[after class] review later"]);
  });

  it("includes the summary in the materials only when present", () => {
    const ctx = { title: "T", course: "", speechLang: "en-US", outputLang: "zh-CN", segments: [], notes: [] };
    expect(lectureMaterials(ctx)).not.toContain("<lecture_summary>");
    expect(lectureMaterials(ctx, "## S")).toContain("<lecture_summary>\n## S\n</lecture_summary>");
  });

  it("asks for the output language and lists questions to avoid", () => {
    const ctx = { title: "T", course: "", speechLang: "en-US", outputLang: "zh-CN", segments: [], notes: [] };
    const prompt = quizPrompt(ctx, undefined, 5, "hard", ["Q1?"]);
    expect(JSON.stringify(prompt.system)).toContain("Simplified Chinese");
    expect(prompt.messages[0].content).toContain("Write 5 questions");
    expect(prompt.messages[0].content).toContain("- Q1?");
  });
});

describe("lectureToMarkdown", () => {
  it("exports summary, notes and transcript with timestamps", () => {
    const lecture: Lecture = {
      id: "l",
      title: "Lecture",
      course: "CS",
      createdAt: 0,
      updatedAt: 0,
      speechLang: "en-US",
      outputLang: "zh-CN",
      translate: true,
      status: "ended",
      durationMs: 60_000,
      takes: [],
      summary: "## 概览\n内容",
    };
    const md = lectureToMarkdown(
      lecture,
      [{ id: "s", lectureId: "l", startMs: 5000, endMs: 9000, text: "Hello", translation: "你好" }],
      [{ id: "n", lectureId: "l", order: 1, t: 6000, text: "重要", kind: "star" }],
      [],
    );
    expect(md).toContain("## 课堂总结");
    expect(md).toContain("- [00:06] ⭐ 重要");
    expect(md).toContain("**[00:05]** Hello\n> 你好");
  });
});
