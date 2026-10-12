"use client";

import { useEffect, useRef, useState } from "react";
import type { DigestResponse, TranslateResponse } from "../api-schemas";
import { db, newId } from "../db";
import { sameLanguage } from "../languages";
import type { Digest, Lecture, NoteBlock, Segment } from "../types";
import { digestDue, pendingForDigest } from "../digest";
import { ApiError, lectureContext, postJson } from "./api";

/**
 * Writes a key-points card every `intervalMs` of lecture while recording, and once more for the
 * leftover stretch when the recording stops.
 */
export function useLiveDigest(opts: {
  lecture: Lecture | undefined;
  segments: Segment[] | undefined;
  notes: NoteBlock[] | undefined;
  digests: Digest[] | undefined;
  recording: boolean;
  enabled: boolean;
  intervalMs: number;
}) {
  const { lecture, segments, notes, digests, recording, enabled, intervalMs } = opts;
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasRecording = useRef(recording);
  const [forceCount, setForceCount] = useState(0);
  const handledForce = useRef(0);
  const stopFlushPending = useRef(false);

  useEffect(() => {
    if (wasRecording.current !== recording) stopFlushPending.current = !recording;
    wasRecording.current = recording;
    if (!lecture || !segments || !digests || !notes || inFlight.current) return;
    const forced = forceCount !== handledForce.current;
    handledForce.current = forceCount;
    const flush = forced || (enabled && stopFlushPending.current);
    stopFlushPending.current = false;
    if (!flush && !(enabled && recording)) return;

    const pending = pendingForDigest(segments, digests);
    if (!digestDue(pending, intervalMs, flush)) return;

    const startMs = pending[0].startMs;
    const endMs = pending[pending.length - 1].endMs;
    const ctx = lectureContext(
      lecture,
      pending,
      notes.filter((n) => n.t !== null && n.t >= startMs - 5000 && n.t <= endMs + 5000),
    );
    inFlight.current = true;
    setBusy(true);
    postJson<DigestResponse>("/api/digest", { ...ctx, previousTitles: digests.slice(-6).map((d) => d.title) })
      .then(async (res) => {
        setError(null);
        await db.digests.add({ id: newId(), lectureId: lecture.id, startMs, endMs, title: res.title, points: res.points });
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "生成要点失败。"))
      .finally(() => {
        inFlight.current = false;
        setBusy(false);
      });
  }, [lecture, segments, notes, digests, recording, enabled, intervalMs, forceCount]);

  const canFlush = Boolean(segments && digests && digestDue(pendingForDigest(segments, digests), intervalMs, true));
  return { busy, error, canFlush, flushNow: () => setForceCount((n) => n + 1) };
}

const TRANSLATE_BATCH = 12;
/** Wait for a few segments (or this long) before translating, to send fewer, larger requests. */
const TRANSLATE_MIN_BATCH = 3;
const TRANSLATE_MAX_WAIT_MS = 4000;

/** Translates transcript segments into the lecture's output language as they arrive. */
export function useLiveTranslation(lecture: Lecture | undefined, segments: Segment[] | undefined) {
  const inFlight = useRef(false);
  const failures = useRef(new Map<string, number>());
  const firstSeen = useRef(new Map<string, number>());
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const active = Boolean(lecture?.translate && !sameLanguage(lecture.speechLang, lecture.outputLang));

  useEffect(() => {
    if (!active || !lecture || !segments || inFlight.current) return;
    const todo = segments.filter((s) => s.translation === undefined && (failures.current.get(s.id) ?? 0) < 3);
    if (todo.length === 0) return;

    const now = Date.now();
    for (const s of todo) if (!firstSeen.current.has(s.id)) firstSeen.current.set(s.id, now);
    const waited = now - firstSeen.current.get(todo[0].id)!;
    if (todo.length < TRANSLATE_MIN_BATCH && waited < TRANSLATE_MAX_WAIT_MS) {
      const timer = setTimeout(() => setRetryTick((n) => n + 1), TRANSLATE_MAX_WAIT_MS - waited);
      return () => clearTimeout(timer);
    }

    const batch = todo.slice(0, TRANSLATE_BATCH);
    const firstIndex = segments.indexOf(batch[0]);
    const context = segments
      .slice(Math.max(0, firstIndex - 3), firstIndex)
      .map((s) => s.text)
      .join(" ");

    inFlight.current = true;
    postJson<TranslateResponse>("/api/translate", {
      speechLang: lecture.speechLang,
      outputLang: lecture.outputLang,
      context,
      items: batch.map((s, i) => ({ i, text: s.text })),
    })
      .then(async (res) => {
        setError(null);
        const byIndex = new Map(res.translations.map((t) => [t.i, t.text]));
        await db.transaction("rw", db.segments, async () => {
          for (const [i, seg] of batch.entries()) {
            const text = byIndex.get(i);
            if (text !== undefined) await db.segments.update(seg.id, { translation: text });
            else failures.current.set(seg.id, (failures.current.get(seg.id) ?? 0) + 1);
          }
        });
      })
      .catch((err: unknown) => {
        for (const seg of batch) failures.current.set(seg.id, (failures.current.get(seg.id) ?? 0) + 1);
        setError(err instanceof ApiError ? err.message : "翻译失败。");
      })
      .finally(() => {
        inFlight.current = false;
        // Pick up whatever arrived while this batch was in flight.
        setTimeout(() => setRetryTick((n) => n + 1), 1500);
      });
  }, [active, lecture, segments, retryTick]);

  return { active, error };
}
