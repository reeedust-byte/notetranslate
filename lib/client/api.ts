import type { LectureContext, StreamEvent } from "../api-schemas";
import type { Lecture, NoteBlock, Segment } from "../types";

export class ApiError extends Error {}

async function errorFrom(res: Response): Promise<ApiError> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return new ApiError(data?.error ?? `请求失败（HTTP ${res.status}）`);
}

export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError("网络连接失败，请检查网络后重试。");
  }
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

/**
 * Posts to a streaming route and calls `onText` with the full text so far on every update.
 * Resolves with the final text and the model's stop reason.
 */
export async function postStream(
  path: string,
  body: unknown,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; stopReason: string | null }> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError("网络连接失败，请检查网络后重试。");
  }
  if (!res.ok || !res.body) throw await errorFrom(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let stopReason: string | null = null;
  let finished = false;

  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    switch (event.type) {
      case "delta":
        text += event.text;
        onText(text);
        break;
      case "reset":
        text = "";
        onText(text);
        break;
      case "done":
        stopReason = event.stopReason;
        finished = true;
        break;
      case "error":
        throw new ApiError(event.message);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  handle(buffer + decoder.decode());
  if (!finished) throw new ApiError("连接中断，回答不完整，请重试。");
  return { text, stopReason };
}

export function lectureContext(lecture: Lecture, segments: Segment[], notes: NoteBlock[]): LectureContext {
  return {
    title: lecture.title,
    course: lecture.course,
    speechLang: lecture.speechLang,
    outputLang: lecture.outputLang,
    segments: segments.map((s) => ({ startMs: s.startMs, endMs: s.endMs, text: s.text })),
    notes: notes.map((n) => ({ t: n.t, text: n.text, kind: n.kind })),
  };
}

/** Note shown under a streamed answer when the model stopped early. */
export function stopReasonNote(stopReason: string | null): string {
  if (stopReason === "max_tokens") return "\n\n> ⚠️ 输出达到长度上限，内容可能不完整。";
  if (stopReason === "refusal") return "\n\n> ⚠️ 模型拒绝回答这个请求。";
  return "";
}
