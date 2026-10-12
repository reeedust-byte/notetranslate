"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { db, newId, touchLecture } from "../db";
import type { Lecture } from "../types";
import { SessionClock } from "./clock";
import { DEMO_SCRIPT } from "./demo-script";
import { AudioCapture, describeMicError } from "./recorder";
import { ScriptedSpeech, WebSpeechSource, type SpeechCallbacks, type SpeechSource } from "./speech";

export type SessionState = "idle" | "starting" | "recording" | "paused" | "stopping";

export interface RecordingSession {
  state: SessionState;
  /** Current lecture timeline position (advances while recording). */
  nowMs: () => number;
  /** Words recognized but not yet finalized. */
  interim: string;
  error: string | null;
  /** Non-fatal issue, e.g. speech recognition unavailable while audio keeps recording. */
  warning: string | null;
  level: () => number;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => void;
  stop: () => Promise<void>;
}

const PERSIST_EVERY_MS = 5000;

/**
 * Drives one recording session: microphone capture into numbered "takes", live speech recognition
 * into transcript segments, and the lecture clock that timestamps everything.
 */
export function useRecordingSession(lecture: Lecture | undefined): RecordingSession {
  const clockRef = useRef(new SessionClock());
  const captureRef = useRef<AudioCapture | null>(null);
  const speechRef = useRef<SpeechSource | null>(null);
  const takeRef = useRef<{ index: number; offsetMs: number } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lectureRef = useRef(lecture);
  lectureRef.current = lecture;

  const [state, setStateRaw] = useState<SessionState>("idle");
  const stateRef = useRef<SessionState>("idle");
  const setState = (s: SessionState) => {
    stateRef.current = s;
    setStateRaw(s);
  };
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const lectureId = lecture?.id;
  const nowMs = useCallback(() => clockRef.current.now(), []);
  const level = useCallback(() => captureRef.current?.level() ?? 0, []);

  const persistProgress = useCallback(async () => {
    const id = lectureRef.current?.id;
    if (!id) return;
    const dur = clockRef.current.now();
    const take = takeRef.current;
    await db.lectures.where("id").equals(id).modify((l) => {
      l.durationMs = Math.max(l.durationMs, dur);
      if (take && l.takes[take.index]) l.takes[take.index].durationMs = dur - take.offsetMs;
      l.updatedAt = Date.now();
    });
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      wakeLockRef.current = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      // Not supported or denied; recording still works, the screen may just sleep.
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, []);

  const startSpeech = useCallback(() => {
    const lec = lectureRef.current;
    if (!lec) return;
    const callbacks: SpeechCallbacks = {
      onInterim: setInterim,
      onFinal: (text, startMs, endMs) => {
        void db.segments.add({ id: newId(), lectureId: lec.id, startMs, endMs, text });
      },
      onError: (message) => setWarning(message),
    };
    const source = lec.demo
      ? new ScriptedSpeech(DEMO_SCRIPT, nowMs, callbacks).seek(clockRef.current.now())
      : new WebSpeechSource(lec.speechLang, nowMs, callbacks);
    speechRef.current = source;
    source.start();
  }, [nowMs]);

  const stopSpeech = useCallback(() => {
    speechRef.current?.stop();
    speechRef.current = null;
    setInterim("");
  }, []);

  const start = useCallback(async () => {
    const lec = lectureRef.current;
    if (!lec || stateRef.current !== "idle") return;
    setState("starting");
    setError(null);
    setWarning(null);
    clockRef.current.reset(lec.durationMs);

    if (!lec.demo) {
      const takeIndex = lec.takes.length;
      const capture = new AudioCapture((blob, seq) =>
        db.audio.add({ lectureId: lec.id, take: takeIndex, seq, blob }).then(() => persistProgress()),
      );
      let mime: string;
      try {
        mime = await capture.start();
      } catch (err) {
        setError(describeMicError(err));
        setState("idle");
        return;
      }
      captureRef.current = capture;
      takeRef.current = { index: takeIndex, offsetMs: lec.durationMs };
      await touchLecture(lec.id, {
        status: "recording",
        takes: [...lec.takes, { offsetMs: lec.durationMs, durationMs: 0, mime }],
      });
    } else {
      await touchLecture(lec.id, { status: "recording" });
    }

    clockRef.current.resume();
    startSpeech();
    void requestWakeLock();
    setState("recording");
  }, [persistProgress, requestWakeLock, startSpeech]);

  const pause = useCallback(async () => {
    const lec = lectureRef.current;
    if (!lec || stateRef.current !== "recording") return;
    captureRef.current?.pause();
    stopSpeech();
    clockRef.current.pause();
    releaseWakeLock();
    setState("paused");
    await persistProgress();
    await touchLecture(lec.id, { status: "paused" });
  }, [persistProgress, releaseWakeLock, stopSpeech]);

  const resume = useCallback(() => {
    const lec = lectureRef.current;
    if (!lec || stateRef.current !== "paused") return;
    captureRef.current?.resume();
    clockRef.current.resume();
    startSpeech();
    void requestWakeLock();
    setState("recording");
    void touchLecture(lec.id, { status: "recording" });
  }, [requestWakeLock, startSpeech]);

  const stop = useCallback(async () => {
    const lec = lectureRef.current;
    if (!lec || (stateRef.current !== "recording" && stateRef.current !== "paused")) return;
    setState("stopping");
    stopSpeech();
    clockRef.current.pause();
    releaseWakeLock();
    await captureRef.current?.stop();
    captureRef.current = null;
    await persistProgress();
    takeRef.current = null;
    await touchLecture(lec.id, { status: "ended" });
    setState("idle");
  }, [persistProgress, releaseWakeLock, stopSpeech]);

  // Tick the timer display and persist the duration regularly while recording.
  useEffect(() => {
    if (state !== "recording") return;
    const tick = setInterval(() => setTick((n) => n + 1), 500);
    const persist = setInterval(() => void persistProgress(), PERSIST_EVERY_MS);
    return () => {
      clearInterval(tick);
      clearInterval(persist);
    };
  }, [state, persistProgress]);

  // The screen wake lock is dropped when the tab is hidden; take it again on return.
  useEffect(() => {
    if (state !== "recording") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [state, requestWakeLock]);

  // Warn before closing the tab mid-lecture.
  useEffect(() => {
    if (state !== "recording" && state !== "paused") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state]);

  // A lecture left "recording" by a closed tab isn't recording anymore.
  useEffect(() => {
    if (!lectureId) return;
    void db.lectures.where("id").equals(lectureId).modify((l) => {
      if (l.status === "recording" && stateRef.current === "idle") l.status = "paused";
    });
  }, [lectureId]);

  // Leaving the page ends the take cleanly; the lecture can be continued later as a new take.
  useEffect(() => {
    return () => {
      if (stateRef.current === "idle") return;
      const id = lectureRef.current?.id;
      speechRef.current?.stop();
      clockRef.current.pause();
      wakeLockRef.current?.release().catch(() => undefined);
      const capture = captureRef.current;
      captureRef.current = null;
      stateRef.current = "idle";
      void (async () => {
        await capture?.stop();
        await persistProgress();
        if (id) await touchLecture(id, { status: "paused" });
      })();
    };
  }, [persistProgress]);

  return { state, nowMs, interim, error, warning, level, start, pause, resume, stop };
}
