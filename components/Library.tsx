"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { StatusResponse } from "@/lib/api-schemas";
import { DEMO_COURSE, DEMO_TITLE } from "@/lib/client/demo-script";
import { loadNewLectureDefaults, saveNewLectureDefaults, type NewLectureDefaults } from "@/lib/client/prefs";
import { speechSupported } from "@/lib/client/speech";
import { db, deleteLecture, newId } from "@/lib/db";
import { OUTPUT_LANGUAGES, SPEECH_LANGUAGES, sameLanguage } from "@/lib/languages";
import { formatDate, formatMs } from "@/lib/time";
import type { Lecture, LectureStatus } from "@/lib/types";
import { btnGhost, btnPrimary, btnQuiet, field } from "./ui";

const STATUS_LABEL: Record<LectureStatus, string> = {
  draft: "未开始",
  recording: "录音中",
  paused: "已暂停",
  ended: "已结束",
};

function defaultTitle(): string {
  const d = new Date();
  return `课堂笔记 ${d.getMonth() + 1}月${d.getDate()}日`;
}

async function createLecture(fields: Pick<Lecture, "title" | "course" | "speechLang" | "outputLang" | "translate"> & { demo?: boolean }) {
  const now = Date.now();
  const lecture: Lecture = {
    id: newId(),
    ...fields,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    durationMs: 0,
    takes: [],
  };
  await db.lectures.add(lecture);
  return lecture.id;
}

function NewLectureForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(defaultTitle);
  const [prefs, setPrefs] = useState<NewLectureDefaults>(loadNewLectureDefaults);
  const [busy, setBusy] = useState(false);
  const same = sameLanguage(prefs.speechLang, prefs.outputLang);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    saveNewLectureDefaults(prefs);
    const id = await createLecture({
      title: title.trim() || defaultTitle(),
      course: prefs.course.trim(),
      speechLang: prefs.speechLang,
      outputLang: prefs.outputLang,
      translate: prefs.translate && !same,
    });
    router.push(`/lecture/${id}`);
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold">新建课堂笔记</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">标题</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">课程（可选）</span>
          <input
            className={field}
            value={prefs.course}
            placeholder="例如：CS 229 机器学习"
            onChange={(e) => setPrefs({ ...prefs, course: e.target.value })}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">教授讲课语言（语音识别）</span>
          <select
            className={field}
            value={prefs.speechLang}
            onChange={(e) => setPrefs({ ...prefs, speechLang: e.target.value })}
          >
            {SPEECH_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">笔记 / 总结 / 测验语言</span>
          <select
            className={field}
            value={prefs.outputLang}
            onChange={(e) => setPrefs({ ...prefs, outputLang: e.target.value })}
          >
            {OUTPUT_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={`mt-4 flex items-center gap-2 text-sm ${same ? "opacity-50" : ""}`}>
        <input
          type="checkbox"
          checked={prefs.translate && !same}
          disabled={same}
          onChange={(e) => setPrefs({ ...prefs, translate: e.target.checked })}
          className="size-4 accent-[var(--color-accent)]"
        />
        实时翻译转写内容{same ? "（讲课语言与笔记语言相同，无需翻译）" : ""}
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btnQuiet} onClick={onCancel}>
          取消
        </button>
        <button type="submit" className={btnPrimary} disabled={busy}>
          创建并进入
        </button>
      </div>
    </form>
  );
}

function LectureCard({ lecture }: { lecture: Lecture }) {
  const snippet = lecture.summary
    ?.split("\n")
    .map((l) =>
      l
        .replace(/^[#>*\-\s]+/, "")
        .replace(/\s*\[\d{1,3}:\d{2}(?::\d{2})?\]/g, "")
        .replace(/\*\*/g, "")
        .trim(),
    )
    .find((l) => l.length > 12);

  const remove = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.confirm(`删除「${lecture.title}」？录音、转写、笔记和测验都会被删除，无法恢复。`)) {
      await deleteLecture(lecture.id);
    }
  };

  return (
    <Link
      href={`/lecture/${lecture.id}`}
      className="group flex flex-col rounded-2xl border border-line bg-panel p-4 transition hover:border-accent/50 hover:shadow-sm"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{lecture.title}</div>
          <div className="mt-0.5 truncate text-xs text-muted">{lecture.course || "未分类"}</div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            lecture.status === "recording"
              ? "bg-rec-soft text-rec"
              : lecture.status === "ended"
                ? "bg-good-soft text-good"
                : "bg-sunk text-muted"
          }`}
        >
          {STATUS_LABEL[lecture.status]}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-muted">{snippet ?? "还没有课堂总结"}</p>
      <div className="mt-3 flex items-center gap-3 text-xs text-faint">
        <span>{formatDate(lecture.createdAt)}</span>
        <span>⏱ {formatMs(lecture.durationMs)}</span>
        {lecture.demo && <span>演示</span>}
        <button
          type="button"
          onClick={remove}
          className="ml-auto rounded px-1.5 py-0.5 text-faint opacity-0 transition group-hover:opacity-100 hover:bg-bad-soft hover:text-bad focus:opacity-100"
        >
          删除
        </button>
      </div>
    </Link>
  );
}

export function Library() {
  const router = useRouter();
  const lectures = useLiveQuery(() => db.lectures.orderBy("updatedAt").reverse().toArray(), []);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [speechOk, setSpeechOk] = useState(true);

  useEffect(() => {
    setSpeechOk(speechSupported());
    fetch("/api/status")
      .then((r) => r.json() as Promise<StatusResponse>)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!lectures || !q) return lectures;
    return lectures.filter((l) => `${l.title} ${l.course} ${l.summary ?? ""}`.toLowerCase().includes(q));
  }, [lectures, query]);

  const startDemo = async () => {
    const id = await createLecture({
      title: DEMO_TITLE,
      course: DEMO_COURSE,
      speechLang: "en-US",
      outputLang: "zh-CN",
      translate: true,
      demo: true,
    });
    router.push(`/lecture/${id}`);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">NoteTranslate 课堂笔记</h1>
        <p className="mt-1 text-sm text-muted">
          边听课边记笔记：教授讲的话实时转写和翻译，每隔一会儿自动提炼要点；下课后一键生成课堂总结和测验，点任意时间戳就能回听那一段。
        </p>
      </header>

      {status && !status.configured && (
        <div className="mb-4 rounded-xl border border-star/40 bg-star-soft px-4 py-3 text-sm">
          服务器还没有配置 <code>ANTHROPIC_API_KEY</code>：录音、转写和记笔记可以正常使用，但要点、翻译、总结、问答和测验需要配置后才能用。
        </div>
      )}
      {!speechOk && (
        <div className="mb-4 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">
          当前浏览器不支持实时语音识别（推荐使用 Chrome、Edge 或 Safari），仍然可以录音和记笔记。
        </div>
      )}

      {creating ? (
        <div className="mb-6">
          <NewLectureForm onCancel={() => setCreating(false)} />
        </div>
      ) : (
        <div className="mb-6 flex flex-wrap gap-2">
          <button className={btnPrimary} onClick={() => setCreating(true)}>
            ＋ 新建课堂笔记
          </button>
          <button className={btnGhost} onClick={startDemo} title="用一段模拟的英文讲课体验全部功能，无需麦克风">
            ▶ 体验演示
          </button>
        </div>
      )}

      {lectures && lectures.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-muted">全部笔记 · {lectures.length}</h2>
          <input
            className={`${field} ml-auto max-w-56 py-1.5`}
            placeholder="搜索标题、课程、总结…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {lectures === undefined ? null : lectures.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center text-sm text-muted">
          还没有笔记。新建一节课开始录音，或者先点「体验演示」看看效果。
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered?.map((l) => <LectureCard key={l.id} lecture={l} />)}
        </div>
      )}
    </div>
  );
}
