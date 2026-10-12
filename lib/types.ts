export type LectureStatus = "draft" | "recording" | "paused" | "ended";

/** One continuous MediaRecorder run. A lecture can have several (pause after reload, "继续录音" after ending). */
export interface Take {
  /** Position of this take on the lecture timeline, in ms. */
  offsetMs: number;
  durationMs: number;
  mime: string;
}

export interface Lecture {
  id: string;
  title: string;
  course: string;
  createdAt: number;
  updatedAt: number;
  /** BCP-47 tag used for speech recognition, e.g. "en-US". */
  speechLang: string;
  /** Language for summaries, quizzes, answers and translations, e.g. "zh-CN". */
  outputLang: string;
  /** Translate each transcript segment into outputLang as it arrives. */
  translate: boolean;
  status: LectureStatus;
  /** Total recorded time on the lecture timeline. */
  durationMs: number;
  takes: Take[];
  /** Demo lectures replay a scripted transcript instead of using the microphone. */
  demo?: boolean;
  summary?: string;
  /** Lecture timeline position the summary was generated at. */
  summaryAtMs?: number;
}

export interface Segment {
  id: string;
  lectureId: string;
  startMs: number;
  endMs: number;
  text: string;
  translation?: string;
}

export type NoteKind = "text" | "star" | "quote";

export interface NoteBlock {
  id: string;
  lectureId: string;
  /** Fractional sort key, so blocks can be inserted between neighbours. */
  order: number;
  /** Lecture timeline position when the block was written; null when written outside a recording. */
  t: number | null;
  text: string;
  kind: NoteKind;
}

/** A live "key points" card covering one stretch of the lecture. */
export interface Digest {
  id: string;
  lectureId: string;
  startMs: number;
  endMs: number;
  title: string;
  points: string[];
}

export interface AudioChunk {
  id?: number;
  lectureId: string;
  take: number;
  seq: number;
  blob: Blob;
}

export interface ChatMessage {
  id: string;
  lectureId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  /** Where in the lecture this was explained, in ms; null when unknown. */
  atMs: number | null;
  concept: string;
}

export interface Quiz {
  id: string;
  lectureId: string;
  createdAt: number;
  questions: QuizQuestion[];
  /** The option the student picked for each question, or null if unanswered. */
  answers: (number | null)[];
}
