import Dexie, { type EntityTable } from "dexie";
import type { AudioChunk, ChatMessage, Digest, Lecture, NoteBlock, Quiz, Segment } from "./types";

/** Everything lives in the browser's IndexedDB; the server only proxies model calls. */
class NotesDB extends Dexie {
  lectures!: EntityTable<Lecture, "id">;
  segments!: EntityTable<Segment, "id">;
  notes!: EntityTable<NoteBlock, "id">;
  digests!: EntityTable<Digest, "id">;
  audio!: EntityTable<AudioChunk, "id">;
  chat!: EntityTable<ChatMessage, "id">;
  quizzes!: EntityTable<Quiz, "id">;

  constructor() {
    super("notetranslate");
    this.version(1).stores({
      lectures: "id, updatedAt, course",
      segments: "id, lectureId, [lectureId+startMs]",
      notes: "id, lectureId, [lectureId+order]",
      digests: "id, lectureId, [lectureId+startMs]",
      audio: "++id, lectureId, [lectureId+take+seq]",
      chat: "id, lectureId, [lectureId+createdAt]",
      quizzes: "id, lectureId, [lectureId+createdAt]",
    });
  }
}

export const db = new NotesDB();

export function newId(): string {
  return crypto.randomUUID();
}

export async function deleteLecture(id: string): Promise<void> {
  await db.transaction("rw", [db.lectures, db.segments, db.notes, db.digests, db.audio, db.chat, db.quizzes], async () => {
    await Promise.all([
      db.segments.where("lectureId").equals(id).delete(),
      db.notes.where("lectureId").equals(id).delete(),
      db.digests.where("lectureId").equals(id).delete(),
      db.audio.where("lectureId").equals(id).delete(),
      db.chat.where("lectureId").equals(id).delete(),
      db.quizzes.where("lectureId").equals(id).delete(),
    ]);
    await db.lectures.delete(id);
  });
}

export async function touchLecture(id: string, changes: Partial<Lecture>): Promise<void> {
  await db.lectures.update(id, { ...changes, updatedAt: Date.now() });
}

/** Builds one playable Blob per take, in take order. */
export async function loadTakeBlobs(lecture: Lecture): Promise<Blob[]> {
  const chunks = await db.audio.where("lectureId").equals(lecture.id).toArray();
  return lecture.takes.map((take, index) => {
    const parts = chunks
      .filter((c) => c.take === index)
      .sort((a, b) => a.seq - b.seq)
      .map((c) => c.blob);
    return new Blob(parts, { type: take.mime });
  });
}
