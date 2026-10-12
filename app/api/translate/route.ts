import { TranslateRequest, type TranslateResponse } from "@/lib/api-schemas";
import { generateJson, handleJson } from "@/lib/server/claude";
import { TranslateOutput } from "@/lib/server/outputs";
import { translatePrompt } from "@/lib/server/prompts";

export const maxDuration = 120;

/** Translates a batch of transcript segments. */
export function POST(request: Request) {
  return handleJson(request, TranslateRequest, async (body): Promise<TranslateResponse> => {
    const prompt = translatePrompt(body.speechLang, body.outputLang, body.context, body.items);
    const out = await generateJson(request, { ...prompt, maxTokens: 8000, effort: "low" }, TranslateOutput);
    const wanted = new Set(body.items.map((item) => item.i));
    return { translations: out.translations.filter((t) => wanted.has(t.i) && t.text.trim() !== "") };
  });
}
