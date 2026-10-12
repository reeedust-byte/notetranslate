import { LectureWorkspace } from "@/components/LectureWorkspace";

export default async function LecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LectureWorkspace id={id} />;
}
