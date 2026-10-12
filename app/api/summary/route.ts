import { SummaryRequest } from "@/lib/api-schemas";
import { handleStream, streamText } from "@/lib/server/claude";
import { summaryPrompt } from "@/lib/server/prompts";

export const maxDuration = 300;

/** Streams structured study notes for the whole lecture. */
export function POST(request: Request) {
  return handleStream(request, SummaryRequest, (body) =>
    streamText(request, { ...summaryPrompt(body), maxTokens: 32000, effort: "medium" }),
  );
}
