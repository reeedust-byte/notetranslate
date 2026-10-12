import { z } from "zod";

/** Request bodies shared by the API routes and the browser client. */

export const SegmentInput = z.object({
  startMs: z.number(),
  endMs: z.number(),
  text: z.string(),
});

export const NoteInput = z.object({
  t: z.number().nullable(),
  text: z.string(),
  kind: z.enum(["text", "star", "quote"]),
});

export const LectureContext = z.object({
  title: z.string(),
  course: z.string(),
  speechLang: z.string(),
  outputLang: z.string(),
  segments: z.array(SegmentInput),
  notes: z.array(NoteInput),
});

export const DigestRequest = LectureContext.extend({
  /** Titles of the earlier key-point cards, so the new card continues rather than repeats them. */
  previousTitles: z.array(z.string()),
});

export const TranslateRequest = z.object({
  speechLang: z.string(),
  outputLang: z.string(),
  /** A little preceding transcript, so short fragments translate in context. */
  context: z.string(),
  items: z.array(z.object({ i: z.number().int(), text: z.string() })).min(1).max(30),
});

export const SummaryRequest = LectureContext;

export const ChatRequest = LectureContext.extend({
  summary: z.string().optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1),
});

export const QuizRequest = LectureContext.extend({
  summary: z.string().optional(),
  count: z.number().int().min(3).max(20),
  difficulty: z.enum(["easy", "medium", "hard"]),
  /** Questions from earlier quizzes, so a new set doesn't repeat them. */
  avoid: z.array(z.string()),
});

export type SegmentInput = z.infer<typeof SegmentInput>;
export type NoteInput = z.infer<typeof NoteInput>;
export type LectureContext = z.infer<typeof LectureContext>;
export type DigestRequest = z.infer<typeof DigestRequest>;
export type TranslateRequest = z.infer<typeof TranslateRequest>;
export type SummaryRequest = z.infer<typeof SummaryRequest>;
export type ChatRequest = z.infer<typeof ChatRequest>;
export type QuizRequest = z.infer<typeof QuizRequest>;

/** Responses of the JSON (non-streaming) routes. */
export interface DigestResponse {
  title: string;
  points: string[];
}

export interface TranslateResponse {
  translations: { i: number; text: string }[];
}

export interface QuizResponse {
  questions: {
    question: string;
    options: string[];
    answerIndex: number;
    explanation: string;
    atMs: number | null;
    concept: string;
  }[];
}

export interface StatusResponse {
  configured: boolean;
  model: string;
}

/** Events of the NDJSON stream returned by /api/summary and /api/chat. */
export type StreamEvent =
  | { type: "delta"; text: string }
  /** The model declined and a fallback model took over: discard the text received so far. */
  | { type: "reset" }
  | { type: "done"; stopReason: string | null }
  | { type: "error"; message: string };
