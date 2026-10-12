import type Anthropic from "@anthropic-ai/sdk";
import type { LectureContext, NoteInput, SegmentInput } from "../api-schemas";
import { promptLanguageName } from "../languages";
import { formatMs } from "../time";

const TRANSCRIPT_CAVEAT =
  "The transcript comes from live speech recognition, so it contains mis-heard words, missing punctuation and " +
  "fragments. Infer what the professor most plausibly said, especially for technical terms, and silently fix " +
  "obvious recognition errors. Never invent content the lecture does not support.";

export function formatTranscript(segments: SegmentInput[]): string {
  if (segments.length === 0) return "(empty)";
  return segments.map((s) => `[${formatMs(s.startMs)}] ${s.text.trim()}`).join("\n");
}

export function formatNotes(notes: NoteInput[]): string {
  const lines = notes
    .filter((n) => n.text.trim() !== "" || n.kind === "star")
    .map((n) => {
      const stamp = n.t === null ? "[after class]" : `[${formatMs(n.t)}]`;
      const tag = n.kind === "star" ? "⭐ STARRED " : n.kind === "quote" ? "(quoted from transcript) " : "";
      return `${stamp} ${tag}${n.text.trim()}`;
    });
  return lines.length === 0 ? "(none)" : lines.join("\n");
}

/** The lecture as a single block of reference material, suitable for prompt caching. */
export function lectureMaterials(ctx: LectureContext, summary?: string): string {
  const parts = [
    "<lecture_info>",
    `Title: ${ctx.title || "(untitled)"}`,
    `Course: ${ctx.course || "(unspecified)"}`,
    `Spoken language: ${promptLanguageName(ctx.speechLang)}`,
    "</lecture_info>",
    "",
    "<transcript>",
    formatTranscript(ctx.segments),
    "</transcript>",
    "",
    "<student_notes>",
    "Notes the student typed during the lecture, stamped with the moment they were written. " +
      "⭐ STARRED marks moments the student flagged as important.",
    formatNotes(ctx.notes),
    "</student_notes>",
  ];
  if (summary?.trim()) {
    parts.push("", "<lecture_summary>", summary.trim(), "</lecture_summary>");
  }
  return parts.join("\n");
}

function materialsBlock(ctx: LectureContext, summary?: string): Anthropic.Beta.BetaTextBlockParam {
  return { type: "text", text: lectureMaterials(ctx, summary), cache_control: { type: "ephemeral" } };
}

export function digestPrompt(ctx: LectureContext, previousTitles: string[]) {
  const lang = promptLanguageName(ctx.outputLang);
  const system = [
    "You are a live note-taking assistant sitting in a university lecture. Every minute or two you receive the " +
      "newest stretch of the transcript and write one key-points card for it, which the student glances at while " +
      "listening.",
    TRANSCRIPT_CAVEAT,
    `Write the card in ${lang}. When you translate a technical term, keep the original in parentheses the first ` +
      "time it appears, e.g. 梯度下降 (gradient descent).",
    "title: a short topic label for this stretch (at most ~12 words, or ~20 CJK characters).",
    "points: 2-5 terse bullet points: claims, definitions, formulas, worked examples, and anything the professor " +
      "stresses (exam hints, 'this is important', deadlines). Prefer concrete content over vague descriptions like " +
      "'the professor discussed X'. Use plain text; write formulas inline in LaTeX between single $ signs. " +
      "No timestamps.",
    "If this stretch is only small talk or logistics, make a single point saying so and keep any dates, deadlines, " +
      "or exam information.",
  ].join("\n\n");

  const user = [
    `Lecture: ${ctx.title || "(untitled)"}${ctx.course ? ` — ${ctx.course}` : ""}`,
    previousTitles.length > 0
      ? `Earlier cards covered, in order: ${previousTitles.map((t) => `"${t}"`).join(", ")}. Continue from there; don't repeat them.`
      : "This is the first card of the lecture.",
    "",
    "<new_transcript>",
    formatTranscript(ctx.segments),
    "</new_transcript>",
    "",
    "<student_notes_during_this_stretch>",
    formatNotes(ctx.notes),
    "</student_notes_during_this_stretch>",
  ].join("\n");

  return { system, messages: [{ role: "user" as const, content: user }] };
}

export function translatePrompt(
  speechLang: string,
  outputLang: string,
  context: string,
  items: { i: number; text: string }[],
) {
  const source = promptLanguageName(speechLang);
  const target = promptLanguageName(outputLang);
  const system = [
    `You translate a university lecture, live, from ${source} into ${target}, for a student following along.`,
    TRANSCRIPT_CAVEAT,
    "Translate each item on its own and return exactly one translation per item, with the same i. Do not merge, " +
      "split, or skip items, and do not add commentary. Keep the translation natural and concise. For specialized " +
      "terms, add the original in parentheses, e.g. 反向传播 (backpropagation).",
  ].join("\n\n");

  const user = [
    context.trim() ? `<preceding_transcript>\n${context.trim()}\n</preceding_transcript>\n` : "",
    "<items>",
    JSON.stringify(items),
    "</items>",
  ].join("\n");

  return { system, messages: [{ role: "user" as const, content: user }] };
}

export function summaryPrompt(ctx: LectureContext) {
  const lang = promptLanguageName(ctx.outputLang);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    {
      type: "text",
      text: [
        "You are an expert teaching assistant. Turn a lecture transcript and the student's own notes into study " +
          "notes the student will review before the exam.",
        TRANSCRIPT_CAVEAT,
        `Write in ${lang}, in Markdown, with section headings in ${lang}. Use these sections:`,
        [
          "1. Overview: 2-3 sentences on what the lecture covered and why it matters.",
          "2. Key takeaways: 3-7 bullets.",
          "3. Detailed notes: one ### subsection per topic, in lecture order, with the topic's start time like " +
            "[12:34] at the end of the heading. Include definitions, formulas, examples and reasoning steps.",
          "4. Key terms: a table of term | explanation; keep the original-language term next to translations.",
          "5. Emphasized by the professor & logistics: exam hints, things called important, deadlines, readings. " +
            "Omit if there are none.",
          "6. Open questions to review: what the student starred or wrote as questions, and points the lecture " +
            "left unclear. Omit if there are none.",
        ].join("\n"),
        "Cite moments of the lecture as [mm:ss] (or [h:mm:ss]) using the transcript's timestamps; the app turns " +
          "them into links that jump to the recording. Give extra weight to what the student starred or noted. You " +
          "may add a brief clarification where the lecture was unclear, marked as a supplement. Write formulas in " +
          "LaTeX between $ signs ($$ for display formulas).",
        "If the transcript is too short to summarize meaningfully, say so briefly and summarize what is there.",
      ].join("\n\n"),
    },
    materialsBlock(ctx),
  ];
  return { system, messages: [{ role: "user" as const, content: "Write the study notes for this lecture." }] };
}

export function chatSystem(ctx: LectureContext, summary?: string): Anthropic.Beta.BetaTextBlockParam[] {
  const lang = promptLanguageName(ctx.outputLang);
  return [
    {
      type: "text",
      text: [
        "You are a study assistant for one specific lecture. The student asks questions about it during or after " +
          "class. Ground your answers in the lecture materials below.",
        TRANSCRIPT_CAVEAT,
        "Cite the moments that support your answer as [mm:ss] timestamps taken from the transcript; the app turns " +
          "them into links that play the recording from there. If the lecture does not cover the question, say so " +
          "plainly, then you may add a short general answer clearly labeled as going beyond the lecture.",
        `Answer in ${lang} unless the student writes in another language, in which case follow theirs. Be concise ` +
          "and use Markdown; write formulas in LaTeX between $ signs.",
      ].join("\n\n"),
    },
    materialsBlock(ctx, summary),
  ];
}

const DIFFICULTY: Record<string, string> = {
  easy: "easy: check recall of the main definitions and facts",
  medium: "medium: mostly understanding, with some recall and a few application questions",
  hard: "hard: mostly application and analysis — new examples, edge cases, comparing concepts",
};

export function quizPrompt(ctx: LectureContext, summary: string | undefined, count: number, difficulty: string, avoid: string[]) {
  const lang = promptLanguageName(ctx.outputLang);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    {
      type: "text",
      text: [
        "You write quizzes that check whether a student understood a lecture they just attended.",
        TRANSCRIPT_CAVEAT,
        `Write everything in ${lang}; keep the original-language technical term in parentheses where it helps.`,
        [
          "Rules for each question:",
          "- Test one important idea from the lecture. Prefer what the professor emphasized or the student starred. " +
            "Skip trivia (dates of the lecture, jokes, logistics).",
          "- options: 4 options with exactly one correct answer. Up to a fifth of the questions may instead be " +
            "true/false with exactly 2 options (true first).",
          "- Distractors must be plausible and reflect real misconceptions, similar in length to the correct option.",
          "- answer_index: the 0-based index of the correct option. Double-check it against the lecture.",
          "- explanation: 1-3 sentences on why the answer is right and why the most tempting wrong option is wrong.",
          "- timestamp: the mm:ss (or h:mm:ss) in the transcript where the lecture explains this, without brackets; " +
            "empty string if no single moment fits.",
          "- concept: a 2-6 word label for the idea being tested.",
        ].join("\n"),
        "Mix recall, understanding and application, ordered roughly as the lecture went.",
      ].join("\n\n"),
    },
    materialsBlock(ctx, summary),
  ];

  const user = [
    `Write ${count} questions. Difficulty — ${DIFFICULTY[difficulty] ?? DIFFICULTY.medium}.`,
    avoid.length > 0
      ? `The student has already seen these questions; ask about different things or from a different angle:\n${avoid
          .map((q) => `- ${q}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, messages: [{ role: "user" as const, content: user }] };
}
