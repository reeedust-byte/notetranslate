import { z } from "zod";
import type { QuizResponse } from "../api-schemas";
import { parseTimestamp } from "../time";

/** JSON shapes the model is constrained to (structured outputs). */

export const DigestOutput = z.object({
  title: z.string(),
  points: z.array(z.string()),
});

export const TranslateOutput = z.object({
  translations: z.array(z.object({ i: z.number().int(), text: z.string() })),
});

export const QuizOutput = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      answer_index: z.number().int(),
      explanation: z.string(),
      timestamp: z.string(),
      concept: z.string(),
    }),
  ),
});

type RawQuiz = z.infer<typeof QuizOutput>;

/**
 * Drops malformed questions, converts timestamps, and shuffles 3+ option questions so the correct
 * answer isn't biased toward one position. `random` is injectable for tests.
 */
export function finalizeQuiz(raw: RawQuiz, durationMs: number, random: () => number = Math.random): QuizResponse {
  const questions: QuizResponse["questions"] = [];
  for (const q of raw.questions) {
    const options = q.options.map((o) => o.trim());
    if (!q.question.trim() || options.length < 2 || options.some((o) => o === "")) continue;
    if (q.answer_index < 0 || q.answer_index >= options.length) continue;

    let order = options.map((_, i) => i);
    if (options.length > 2) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    } else {
      order = [0, 1];
    }

    const atMs = parseTimestamp(q.timestamp);
    questions.push({
      question: q.question.trim(),
      options: order.map((i) => options[i]),
      answerIndex: order.indexOf(q.answer_index),
      explanation: q.explanation.trim(),
      atMs: atMs !== null && atMs <= durationMs + 60_000 ? atMs : null,
      concept: q.concept.trim(),
    });
  }
  return { questions };
}
