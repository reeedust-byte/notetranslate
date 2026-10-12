import { DigestRequest, type DigestResponse } from "@/lib/api-schemas";
import { generateJson, handleJson } from "@/lib/server/claude";
import { DigestOutput } from "@/lib/server/outputs";
import { digestPrompt } from "@/lib/server/prompts";

export const maxDuration = 120;

/** One live key-points card for the newest stretch of the lecture. */
export function POST(request: Request) {
  return handleJson(request, DigestRequest, async (body): Promise<DigestResponse> => {
    const prompt = digestPrompt(body, body.previousTitles);
    const out = await generateJson(request, { ...prompt, maxTokens: 4000, effort: "low" }, DigestOutput);
    return { title: out.title.trim(), points: out.points.map((p) => p.trim()).filter(Boolean) };
  });
}
