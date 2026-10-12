"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadTakeBlobs } from "../db";
import type { Lecture, Take } from "../types";

export interface Playback {
  available: boolean;
  playing: boolean;
  /** Current position on the lecture timeline. */
  currentMs: number;
  rate: number;
  toggle: () => void;
  seek: (ms: number, autoplay?: boolean) => void;
  skip: (deltaMs: number) => void;
  setRate: (rate: number) => void;
}

function takeAt(takes: Take[], ms: number): number {
  for (let i = takes.length - 1; i >= 0; i--) {
    if (ms >= takes[i].offsetMs) return i;
  }
  return 0;
}

/**
 * Plays a lecture's recording as one continuous timeline, even though it may consist of several takes
 * (each its own audio file).
 */
export function usePlayback(lecture: Lecture | undefined, enabled: boolean): Playback {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlsRef = useRef<string[]>([]);
  const takesRef = useRef<Take[]>([]);
  const currentTakeRef = useRef(-1);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [rate, setRateState] = useState(1);
  const rateRef = useRef(1);

  const lectureId = lecture?.id;
  const takeKey = lecture ? lecture.takes.map((t) => `${t.offsetMs}+${Math.round(t.durationMs / 1000)}`).join(",") : "";

  const loadTake = useCallback((index: number, offsetInTakeMs: number, autoplay: boolean) => {
    const audio = audioRef.current;
    const url = urlsRef.current[index];
    if (!audio || !url) return;
    const seekWithin = () => {
      audio.currentTime = Math.max(0, offsetInTakeMs / 1000);
      audio.playbackRate = rateRef.current;
      if (autoplay) void audio.play().catch(() => setPlaying(false));
    };
    if (currentTakeRef.current !== index) {
      currentTakeRef.current = index;
      audio.src = url;
      audio.addEventListener("loadedmetadata", seekWithin, { once: true });
      audio.load();
    } else {
      seekWithin();
    }
  }, []);

  // (Re)load the audio whenever the set of takes changes and nothing is being recorded.
  useEffect(() => {
    if (!enabled || !lecture || lecture.takes.length === 0) {
      setReady(false);
      return;
    }
    let cancelled = false;
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    void loadTakeBlobs(lecture).then((blobs) => {
      if (cancelled) return;
      urlsRef.current = blobs.map((b) => URL.createObjectURL(b));
      takesRef.current = lecture.takes;
      currentTakeRef.current = -1;
      setReady(blobs.some((b) => b.size > 0));
    });

    const onTime = () => {
      const take = takesRef.current[currentTakeRef.current];
      if (take) setCurrentMs(take.offsetMs + audio.currentTime * 1000);
    };
    const onEnded = () => {
      const next = currentTakeRef.current + 1;
      if (next < takesRef.current.length) {
        loadTake(next, 0, true);
      } else {
        setPlaying(false);
      }
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);

    return () => {
      cancelled = true;
      audio.pause();
      audio.removeAttribute("src");
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
      audioRef.current = null;
      setPlaying(false);
    };
    // Reload only when the takes themselves change, not on every lecture update.
  }, [enabled, lectureId, takeKey, loadTake]);

  const seek = useCallback(
    (ms: number, autoplay?: boolean) => {
      const takes = takesRef.current;
      if (!audioRef.current || takes.length === 0) return;
      const index = takeAt(takes, ms);
      const shouldPlay = autoplay ?? !audioRef.current.paused;
      setCurrentMs(ms);
      loadTake(index, ms - takes[index].offsetMs, shouldPlay);
    },
    [loadTake],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentTakeRef.current === -1) {
      seek(currentMs, true);
    } else if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [currentMs, seek]);

  const skip = useCallback(
    (deltaMs: number) => {
      const total = takesRef.current.reduce((max, t) => Math.max(max, t.offsetMs + t.durationMs), 0);
      seek(Math.min(Math.max(0, currentMs + deltaMs), total));
    },
    [currentMs, seek],
  );

  const setRate = useCallback((r: number) => {
    rateRef.current = r;
    setRateState(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
  }, []);

  return { available: ready, playing, currentMs, rate, toggle, seek, skip, setRate };
}
