"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { db, newId } from "@/lib/db";
import { formatMs } from "@/lib/time";
import type { NoteBlock, NoteKind } from "@/lib/types";
import { btnGhost, panel, panelHeader } from "./ui";

interface Props {
  lectureId: string;
  notes: NoteBlock[] | undefined;
  /** Timeline position for new notes, or null when nothing is being recorded. */
  stampNow: () => number | null;
  /** Playback position when replaying; null hides the replay sync. */
  replayMs: number | null;
  onSeek: (ms: number) => void;
  className?: string;
}

const SAVE_DELAY_MS = 400;

function orderAfter(notes: NoteBlock[], index: number): number {
  const cur = notes[index];
  const next = notes[index + 1];
  if (!cur) return (notes.at(-1)?.order ?? 0) + 1;
  return next ? (cur.order + next.order) / 2 : cur.order + 1;
}

export async function addNote(lectureId: string, notes: NoteBlock[], kind: NoteKind, text: string, t: number | null) {
  const block: NoteBlock = { id: newId(), lectureId, order: orderAfter(notes, notes.length - 1), t, text, kind };
  await db.notes.add(block);
  return block.id;
}

function NoteRow(props: {
  block: NoteBlock;
  dim: boolean;
  current: boolean;
  register: (id: string, el: HTMLTextAreaElement | null) => void;
  onText: (block: NoteBlock, text: string) => void;
  onEnter: (block: NoteBlock, before: string, after: string) => void;
  onRemoveEmpty: (block: NoteBlock) => void;
  onMove: (block: NoteBlock, dir: -1 | 1) => void;
  onSeek: (ms: number) => void;
}) {
  const { block, dim, current, register, onText, onEnter, onRemoveEmpty, onMove, onSeek } = props;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState(block.text);
  const focused = useRef(false);

  // Take outside changes (e.g. a split by Enter) unless the student is typing in this block.
  useEffect(() => {
    if (!focused.current) setText(block.text);
  }, [block.text]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Never act on keys that confirm an IME composition (e.g. Chinese pinyin input).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const el = e.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const before = el.value.slice(0, el.selectionStart);
      const after = el.value.slice(el.selectionEnd);
      setText(before);
      onEnter(block, before, after);
    } else if (e.key === "Backspace" && el.value === "") {
      e.preventDefault();
      onRemoveEmpty(block);
    } else if (e.key === "ArrowUp" && atStart) {
      e.preventDefault();
      onMove(block, -1);
    } else if (e.key === "ArrowDown" && atEnd) {
      e.preventDefault();
      onMove(block, 1);
    }
  };

  const kindStyle =
    block.kind === "star"
      ? "border-l-2 border-star bg-star-soft/60 pl-2"
      : block.kind === "quote"
        ? "border-l-2 border-line pl-2 text-muted italic"
        : "";

  return (
    <div
      className={`group flex items-start gap-2 rounded-md px-1 transition-opacity duration-300 ${dim ? "opacity-25" : ""} ${
        current ? "bg-accent-soft/60" : ""
      }`}
    >
      <div className="w-12 shrink-0 pt-[7px] text-right">
        {block.t !== null && (
          <button
            type="button"
            onClick={() => onSeek(block.t!)}
            className="font-mono text-[11px] text-faint tabular-nums hover:text-accent"
            title="跳到写下这条笔记时的录音"
          >
            {formatMs(block.t)}
          </button>
        )}
      </div>
      <div className={`flex min-w-0 flex-1 items-start gap-1 ${kindStyle}`}>
        {block.kind === "star" && <span className="pt-[5px] text-sm">⭐</span>}
        <textarea
          ref={(el) => {
            ref.current = el;
            register(block.id, el);
          }}
          rows={1}
          value={text}
          placeholder={block.kind === "star" ? "重点：" : "记点什么…"}
          onFocus={() => (focused.current = true)}
          onBlur={(e) => {
            focused.current = false;
            onText(block, e.currentTarget.value);
          }}
          onChange={(e) => {
            setText(e.target.value);
            onText(block, e.target.value);
          }}
          onKeyDown={onKeyDown}
          className="block w-full resize-none overflow-hidden bg-transparent py-1 text-[15px] leading-[1.6] outline-none placeholder:text-faint/70"
        />
      </div>
    </div>
  );
}

/**
 * A block-based notes editor. Every block remembers when in the lecture it was written, so notes link
 * back to the recording — and during playback, notes fade in as the audio reaches them (as in Notability).
 */
export function NotesEditor({ lectureId, notes, stampNow, replayMs, onSeek, className }: Props) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ id: string; at: "start" | "end" } | null>(null);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [replaySync, setReplaySync] = useState(true);

  // Blocks created here are shown (and focused) right away, before IndexedDB reports them back,
  // so fast typing after Enter never lands in the previous block.
  const [optimistic, setOptimistic] = useState<NoteBlock[]>([]);
  const blocks = useMemo(() => {
    const base = notes ?? [];
    const known = new Set(base.map((n) => n.id));
    const extra = optimistic.filter((b) => !known.has(b.id));
    return extra.length === 0 ? base : [...base, ...extra].sort((a, b) => a.order - b.order);
  }, [notes, optimistic]);
  useEffect(() => {
    if (!notes) return;
    const known = new Set(notes.map((n) => n.id));
    setOptimistic((prev) => (prev.some((b) => known.has(b.id)) ? prev.filter((b) => !known.has(b.id)) : prev));
  }, [notes]);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // Writes run one at a time, in order, so an update never races ahead of the add it depends on.
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback((op: () => Promise<unknown>) => {
    writes.current = writes.current.then(op).catch((err: unknown) => console.error("保存笔记失败", err));
  }, []);

  const register = useCallback((id: string, el: HTMLTextAreaElement | null) => {
    if (el) {
      refs.current.set(id, el);
      if (pendingFocus.current?.id === id) {
        const at = pendingFocus.current.at;
        pendingFocus.current = null;
        el.focus();
        const pos = at === "start" ? 0 : el.value.length;
        el.setSelectionRange(pos, pos);
      }
    } else {
      refs.current.delete(id);
    }
  }, []);

  const focusBlock = (id: string, at: "start" | "end") => {
    const el = refs.current.get(id);
    if (el) {
      el.focus();
      const pos = at === "start" ? 0 : el.value.length;
      el.setSelectionRange(pos, pos);
    } else {
      pendingFocus.current = { id, at };
    }
  };

  /** Shows a new block immediately, focuses it once rendered, and saves it. */
  const insertBlock = useCallback(
    (block: NoteBlock, focusAt: "start" | "end") => {
      pendingFocus.current = { id: block.id, at: focusAt };
      setOptimistic((prev) => [...prev, block]);
      enqueue(() => db.notes.add(block));
    },
    [enqueue],
  );

  // An empty lecture starts with one empty block to type into.
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (notes && notes.length === 0 && seeded.current !== lectureId) {
      seeded.current = lectureId;
      enqueue(() => db.notes.add({ id: newId(), lectureId, order: 1, t: null, text: "", kind: "text" }));
    }
  }, [notes, lectureId, enqueue]);

  // A block is stamped with the lecture time at the first keystroke into it, decided once per block
  // (blocks written before the recording, or outside one, stay unstamped).
  const stamps = useRef(new Map<string, number | null>());
  const stampFor = useCallback(
    (block: NoteBlock, text: string): number | null => {
      if (block.t !== null) return null;
      const decided = stamps.current.get(block.id);
      if (decided !== undefined) return decided;
      if (text === "") return null;
      const value = block.text === "" ? stampNow() : null;
      stamps.current.set(block.id, value);
      return value;
    },
    [stampNow],
  );

  const onText = useCallback(
    (block: NoteBlock, text: string) => {
      const stamp = stampFor(block, text);
      const timers = saveTimers.current;
      clearTimeout(timers.get(block.id));
      timers.set(
        block.id,
        setTimeout(() => {
          timers.delete(block.id);
          enqueue(() => db.notes.update(block.id, stamp === null ? { text } : { text, t: stamp }));
        }, SAVE_DELAY_MS),
      );
    },
    [stampFor, enqueue],
  );

  const onEnter = useCallback(
    (block: NoteBlock, before: string, after: string) => {
      const list = blocksRef.current;
      const index = list.findIndex((n) => n.id === block.id);
      clearTimeout(saveTimers.current.get(block.id));
      const stamp = stampFor(block, before);
      enqueue(() => db.notes.update(block.id, stamp === null ? { text: before } : { text: before, t: stamp }));
      insertBlock(
        { id: newId(), lectureId, order: orderAfter(list, index), t: after !== "" ? stampNow() : null, text: after, kind: "text" },
        "start",
      );
    },
    [lectureId, stampNow, stampFor, enqueue, insertBlock],
  );

  const onRemoveEmpty = useCallback(
    (block: NoteBlock) => {
      const list = blocksRef.current;
      if (list.length <= 1) return;
      const index = list.findIndex((n) => n.id === block.id);
      const target = list[index - 1] ?? list[index + 1];
      clearTimeout(saveTimers.current.get(block.id));
      saveTimers.current.delete(block.id);
      setOptimistic((prev) => prev.filter((b) => b.id !== block.id));
      if (target) focusBlock(target.id, "end");
      enqueue(() => db.notes.delete(block.id));
    },
    [enqueue],
  );

  const onMove = useCallback((block: NoteBlock, dir: -1 | 1) => {
    const list = blocksRef.current;
    const index = list.findIndex((n) => n.id === block.id);
    const target = list[index + dir];
    if (target) focusBlock(target.id, dir === -1 ? "end" : "start");
  }, []);

  const addStar = () => {
    const list = blocksRef.current;
    insertBlock({ id: newId(), lectureId, order: orderAfter(list, list.length - 1), t: stampNow(), text: "", kind: "star" }, "end");
  };

  const syncing = replayMs !== null && replaySync;
  // The most recently written note at the playback position.
  let currentId: string | null = null;
  if (syncing) {
    let best = -1;
    for (const n of blocks) {
      if (n.t !== null && n.t <= replayMs && n.t >= best) {
        best = n.t;
        currentId = n.id;
      }
    }
  }

  return (
    <section className={`${panel} ${className ?? ""}`}>
      <div className={panelHeader}>
        <h2 className="text-sm font-semibold">笔记</h2>
        <span className="hidden text-xs text-faint sm:inline">Enter 新起一条 · 每条自动记录时间</span>
        <div className="ml-auto flex items-center gap-2">
          {replayMs !== null && (
            <label className="flex items-center gap-1.5 text-xs text-muted" title="回放时笔记随录音进度逐条出现">
              <input
                type="checkbox"
                checked={replaySync}
                onChange={(e) => setReplaySync(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              回放同步
            </label>
          )}
          <button type="button" className={`${btnGhost} px-2 py-1 text-xs`} onClick={addStar} title="在当前时间点标记重点">
            ⭐ 标记重点
          </button>
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto max-w-2xl space-y-0.5">
          {blocks.map((block) => (
            <NoteRow
              key={block.id}
              block={block}
              dim={syncing && block.t !== null && block.t > replayMs!}
              current={block.id === currentId}
              register={register}
              onText={onText}
              onEnter={onEnter}
              onRemoveEmpty={onRemoveEmpty}
              onMove={onMove}
              onSeek={onSeek}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
