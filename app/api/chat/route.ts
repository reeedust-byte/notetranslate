import { ChatRequest } from "@/lib/api-schemas";
import { handleStream, streamText } from "@/lib/server/claude";
import { chatSystem } from "@/lib/server/prompts";

export const maxDuration = 300;

/** Answers questions about the lecture, grounded in its transcript and notes. */
export function POST(request: Request) {
  return handleStream(request, ChatRequest, (body) =>
    streamText(request, {
      system: chatSystem(body, body.summary),
      messages: body.messages,
      maxTokens: 16000,
      effort: "medium",
    }),
  );
}
