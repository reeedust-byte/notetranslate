"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { touchLecture } from "../db";
import type { Lecture, NoteBlock, Segment } from "../types";
import { ApiError, lectureContext, postStream, stopReasonNote } from "./api";

/** Generates the whole-lecture study notes, streaming them in, and saves the result on the lecture. */
export function useSummary(lecture: Lecture | undefined, segments: Segment[] | undefined, notes: NoteBlock[] | undefined) {
  const [draft, setDraft] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async () => {
    if (!lecture || !segments || !notes || segments.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const atMs = segments[segments.length - 1].endMs;
    setRunning(true);
    setError(null);
    setDraft("");
    try {
      const { text, stopReason } = await postStream(
        "/api/summary",
        lectureContext(lecture, segments, notes),
        setDraft,
        controller.signal,
      );
      const full = text + stopReasonNote(stopReason);
      await touchLecture(lecture.id, { summary: full, summaryAtMs: atMs });
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof ApiError ? err.message : "生成总结失败。");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setRunning(false);
        setDraft(null);
      }
    }
  }, [lecture, segments, notes]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setDraft(null);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { text: draft ?? lecture?.summary ?? null, running, error, generate, cancel };
}
