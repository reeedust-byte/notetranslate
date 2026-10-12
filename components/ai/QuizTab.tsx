"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Dexie from "dexie";
import { useEffect, useRef, useState } from "react";
import type { QuizRequest, QuizResponse } from "@/lib/api-schemas";
import { ApiError, lectureContext, postJson } from "@/lib/client/api";
import { db, newId } from "@/lib/db";
import { formatMs } from "@/lib/time";
import type { Lecture, NoteBlock, Quiz, Segment } from "@/lib/types";
import { Markdown } from "../Markdown";
import { btnGhost, btnPrimary, btnQuiet } from "../ui";

interface Props {
  lecture: Lecture;
  segments: Segment[];
  notes: NoteBlock[];
  recording: boolean;
  onSeek: (ms: number) => void;
}

const COUNTS = [5, 10, 15];
const DIFFICULTIES: { value: QuizRequest["difficulty"]; label: string }[] = [
  { value: "easy", label: "基础" },
  { value: "medium", label: "中等" },
  { value: "hard", label: "进阶" },
];
const LETTERS = "ABCDEFGH";

function QuestionCard({
  quiz,
  index,
  onAnswer,
  onSeek,
}: {
  quiz: Quiz;
  index: number;
  onAnswer: (index: number, option: number) => void;
  onSeek: (ms: number) => void;
}) {
  const q = quiz.questions[index];
  const chosen = quiz.answers[index];
  const answered = chosen !== null;
  const correct = chosen === q.answerIndex;

  return (
    <article className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-faint">
        <span className="font-semibold text-muted">第 {index + 1} 题</span>
        {q.concept && <span className="rounded-full bg-sunk px-2 py-0.5">{q.concept}</span>}
        {answered && <span className={`ml-auto font-semibold ${correct ? "text-good" : "text-bad"}`}>{correct ? "✓ 正确" : "✗ 错误"}</span>}
      </div>
      <Markdown text={q.question} className="font-medium" />
      <div className="mt-3 grid gap-2">
        {q.options.map((option, i) => {
          let style = "border-line hover:border-accent/60 hover:bg-sunk";
          if (answered) {
            if (i === q.answerIndex) style = "border-good bg-good-soft";
            else if (i === chosen) style = "border-bad bg-bad-soft";
            else style = "border-line opacity-60";
          }
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => onAnswer(index, i)}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-default ${style}`}
            >
              <span className="mt-px font-mono text-xs text-faint">{LETTERS[i]}</span>
              <Markdown text={option} className="min-w-0 flex-1 text-sm" />
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="mt-3 rounded-lg bg-sunk px-3 py-2 text-sm">
          <Markdown text={q.explanation} onSeek={onSeek} />
          {q.atMs !== null && (
            <button type="button" className="ts-chip ml-0 mt-2" onClick={() => onSeek(q.atMs!)}>
              ▸ 回听讲解 {formatMs(q.atMs)}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** Multiple-choice quiz on the lecture, with explanations that jump back to where it was taught. */
export function QuizTab({ lecture, segments, notes, recording, onSeek }: Props) {
  const quizzes = useLiveQuery(
    () =>
      db.quizzes
        .where("[lectureId+createdAt]")
        .between([lecture.id, Dexie.minKey], [lecture.id, Dexie.maxKey])
        .toArray(),
    [lecture.id],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<QuizRequest["difficulty"]>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const quiz = quizzes?.find((q) => q.id === selectedId) ?? quizzes?.at(-1);

  const generate = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const body: QuizRequest = {
        ...lectureContext(lecture, segments, notes),
        summary: lecture.summary,
        count,
        difficulty,
        avoid: (quizzes ?? []).flatMap((q) => q.questions.map((x) => x.question)).slice(-40),
      };
      const res = await postJson<QuizResponse>("/api/quiz", body, controller.signal);
      const id = newId();
      await db.quizzes.add({
        id,
        lectureId: lecture.id,
        createdAt: Date.now(),
        questions: res.questions,
        answers: res.questions.map(() => null),
      });
      setSelectedId(id);
      setShowSetup(false);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof ApiError ? err.message : "出题失败，请重试。");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const answer = async (index: number, option: number) => {
    if (!quiz) return;
    const answers = [...quiz.answers];
    answers[index] = option;
    await db.quizzes.update(quiz.id, { answers });
  };

  const retake = async () => {
    if (quiz) await db.quizzes.update(quiz.id, { answers: quiz.questions.map(() => null) });
  };

  const setup = (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="grid gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-10 text-muted">题量</span>
          {COUNTS.map((c) => (
            <button key={c} type="button" onClick={() => setCount(c)} className={c === count ? btnPrimary : btnGhost}>
              {c} 题
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-10 text-muted">难度</span>
          {DIFFICULTIES.map((d) => (
            <button key={d.value} type="button" onClick={() => setDifficulty(d.value)} className={d.value === difficulty ? btnPrimary : btnGhost}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad">{error}</div>}
      <div className="mt-4 flex items-center gap-2">
        <button className={btnPrimary} disabled={busy || segments.length === 0} onClick={generate}>
          {busy ? "出题中…" : quiz ? "再出一套新题" : "✍️ 生成测验"}
        </button>
        {busy && (
          <>
            <span className="text-xs text-faint">大约需要半分钟到一分钟</span>
            <button className={`${btnQuiet} ml-auto`} onClick={() => abortRef.current?.abort()}>
              取消
            </button>
          </>
        )}
        {quiz && !busy && (
          <button className={`${btnQuiet} ml-auto`} onClick={() => setShowSetup(false)}>
            返回
          </button>
        )}
      </div>
    </div>
  );

  if (!quiz || showSetup) {
    return (
      <div className="space-y-3 p-4">
        {!quiz && (
          <p className="px-2 pt-4 text-center text-sm leading-relaxed text-muted">
            下课后来做一套测验，检验这节课学会了没有。每道题都有解析，并且能一键跳回老师讲这个知识点的录音。
          </p>
        )}
        {recording && !quiz && <p className="text-center text-xs text-faint">课还在进行，建议结束录音后再生成。</p>}
        {setup}
      </div>
    );
  }

  const answered = quiz.answers.filter((a) => a !== null).length;
  const right = quiz.answers.filter((a, i) => a === quiz.questions[i].answerIndex).length;
  const done = answered === quiz.questions.length;

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">
          已答 {answered}/{quiz.questions.length} · 答对 <span className="font-semibold text-good">{right}</span>
        </span>
        {quizzes && quizzes.length > 1 && (
          <select
            value={quiz.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="ml-auto rounded-md border border-line bg-panel px-2 py-1 text-xs"
          >
            {quizzes.map((q, i) => (
              <option key={q.id} value={q.id}>
                第 {i + 1} 套（{q.questions.length} 题）
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunk">
        <div className="h-full bg-accent transition-all" style={{ width: `${(answered / quiz.questions.length) * 100}%` }} />
      </div>

      {quiz.questions.map((_, i) => (
        <QuestionCard key={`${quiz.id}-${i}`} quiz={quiz} index={i} onAnswer={answer} onSeek={onSeek} />
      ))}

      {done && (
        <div className="rounded-xl border border-line bg-panel p-4 text-center">
          <div className="text-3xl font-bold">
            {right}/{quiz.questions.length}
          </div>
          <p className="mt-1 text-sm text-muted">
            {right === quiz.questions.length ? "全对！这节课掌握得很好。" : right / quiz.questions.length >= 0.6 ? "不错，看看错题的解析，回听对应片段。" : "建议回看总结并回听错题对应的讲解。"}
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <button className={btnGhost} onClick={retake}>
              重做这套
            </button>
            <button className={btnPrimary} onClick={() => setShowSetup(true)}>
              再出一套
            </button>
          </div>
        </div>
      )}
      {!done && (
        <div className="flex justify-end">
          <button className={`${btnQuiet} text-xs`} onClick={() => setShowSetup(true)}>
            换一套题
          </button>
        </div>
      )}
    </div>
  );
}
