"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Dexie from "dexie";
import { useEffect, useRef, useState } from "react";
import { ApiError, lectureContext, postStream, stopReasonNote } from "@/lib/client/api";
import { db, newId } from "@/lib/db";
import type { Lecture, NoteBlock, Segment } from "@/lib/types";
import { Markdown } from "../Markdown";
import { btnPrimary, btnQuiet, field } from "../ui";

interface Props {
  lecture: Lecture;
  segments: Segment[];
  notes: NoteBlock[];
  onSeek: (ms: number) => void;
}

const SUGGESTIONS = [
  "这节课最重要的 3 个知识点是什么？",
  "刚才那几分钟讲了什么？我走神了",
  "用通俗的例子解释一下这节课的核心概念",
  "老师有没有提到考试、作业或截止日期？",
];

/** Ask questions about the lecture; answers cite timestamps that play the recording. */
export function ChatTab({ lecture, segments, notes, onSeek }: Props) {
  const messages = useLiveQuery(
    () =>
      db.chat
        .where("[lectureId+createdAt]")
        .between([lecture.id, Dexie.minKey], [lecture.id, Dexie.maxKey])
        .toArray(),
    [lecture.id],
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || streaming !== null || !messages) return;
    setInput("");
    setError(null);
    const history = [...messages.map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: q }];
    await db.chat.add({ id: newId(), lectureId: lecture.id, role: "user", content: q, createdAt: Date.now() });

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming("");
    try {
      const { text, stopReason } = await postStream(
        "/api/chat",
        { ...lectureContext(lecture, segments, notes), summary: lecture.summary, messages: history },
        setStreaming,
        controller.signal,
      );
      await db.chat.add({
        id: newId(),
        lectureId: lecture.id,
        role: "assistant",
        content: text + stopReasonNote(stopReason),
        createdAt: Date.now(),
      });
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof ApiError ? err.message : "回答失败，请重试。");
    } finally {
      abortRef.current = null;
      setStreaming(null);
    }
  };

  const clear = async () => {
    if (window.confirm("清空这节课的问答记录？")) {
      await db.chat.where("lectureId").equals(lecture.id).delete();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  };

  const empty = messages?.length === 0 && streaming === null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {empty && (
          <div className="py-6">
            <p className="text-center text-sm text-muted">关于这节课，问什么都可以。回答会引用课堂原话的时间点，点一下就能回听。</p>
            <div className="mt-4 grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={segments.length === 0}
                  onClick={() => void ask(s)}
                  className="rounded-xl border border-line bg-panel px-3 py-2 text-left text-sm transition hover:border-accent/50 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages?.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-8 rounded-2xl rounded-br-md bg-accent-soft px-3 py-2 text-sm whitespace-pre-wrap">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="mr-2">
              <Markdown text={m.content} onSeek={onSeek} />
            </div>
          ),
        )}
        {streaming !== null && (
          <div className="mr-2">
            {streaming ? (
              <Markdown text={streaming} onSeek={onSeek} />
            ) : (
              <span className="flex items-center gap-2 text-xs text-accent">
                <span className="rec-dot inline-block size-1.5 rounded-full bg-accent" />
                思考中…
              </span>
            )}
          </div>
        )}
        {error && <div className="rounded-xl bg-bad-soft px-3 py-2 text-xs text-bad">{error}</div>}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={segments.length === 0 ? "开始录音后就可以提问" : "问问这节课…（Enter 发送，Shift+Enter 换行）"}
            className={`${field} resize-none`}
          />
          <div className="flex flex-col gap-1">
            {streaming !== null ? (
              <button className={btnQuiet} onClick={() => abortRef.current?.abort()}>
                停止
              </button>
            ) : (
              <button className={btnPrimary} disabled={!input.trim() || segments.length === 0} onClick={() => void ask(input)}>
                发送
              </button>
            )}
            {!empty && streaming === null && (
              <button className={`${btnQuiet} px-2 py-0.5 text-xs`} onClick={clear}>
                清空
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
