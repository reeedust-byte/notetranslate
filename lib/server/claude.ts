import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { StreamEvent } from "../api-schemas";

export const MODEL = process.env.CLAUDE_MODEL?.trim() || "claude-opus-5-5";

type Effort = "low" | "medium" | "high";

export interface ClaudeRequest {
  system: Anthropic.Beta.BetaTextBlockParam[] | string;
  messages: Anthropic.Beta.BetaMessageParam[];
  maxTokens: number;
  effort: Effort;
}

/** An error whose message is safe and useful to show the student. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

/**
 * Server-side refusal fallback: if a safety classifier declines a request, the API re-runs it
 * on the fallback model Anthropic recommends for that category instead of returning a refusal.
 * Set CLAUDE_FALLBACKS=off to disable (e.g. for models that don't support it).
 */
function fallbackParams(): { betas?: Anthropic.Beta.AnthropicBeta[]; fallbacks?: "default" } {
  if (process.env.CLAUDE_FALLBACKS?.trim() === "off") return {};
  return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
}

function baseParams(req: ClaudeRequest) {
  return {
    model: MODEL,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: req.messages,
    thinking: { type: "adaptive" as const },
    ...fallbackParams(),
  };
}

export function describeError(err: unknown): { status: number; message: string } {
  if (err instanceof UserFacingError) return { status: err.status, message: err.message };
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 401, message: "Anthropic API Key 无效，请检查服务器上的 ANTHROPIC_API_KEY。" };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { status: 403, message: `当前 API Key 无权使用模型 ${MODEL}。` };
  }
  if (err instanceof Anthropic.NotFoundError) {
    return { status: 404, message: `找不到模型 ${MODEL}，请检查 CLAUDE_MODEL 设置。` };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "请求太频繁，已触发限流，请稍后再试。" };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 400, message: `请求被 API 拒绝：${err.message}` };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, message: "无法连接到 Anthropic API，请检查服务器网络。" };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: err.status ?? 500, message: `Claude API 出错（${err.status ?? "未知"}）：${err.message}` };
  }
  if (!isConfigured()) {
    return { status: 500, message: "服务器未配置 ANTHROPIC_API_KEY，请在 .env.local 中设置后重启。" };
  }
  return { status: 500, message: err instanceof Error ? err.message : String(err) };
}

/** Streams the model's text back as NDJSON StreamEvents. */
export function streamText(request: Request, req: ClaudeRequest): Response {
  const stream = getClient().beta.messages.stream(
    { ...baseParams(req), output_config: { effort: req.effort } },
    { signal: request.signal },
  );
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // The client went away; nothing left to deliver to.
        }
      };
      try {
        for await (const event of stream) {
          if (event.type === "content_block_start" && event.content_block.type === "fallback") {
            send({ type: "reset" });
          } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send({ type: "delta", text: event.delta.text });
          }
        }
        const final = await stream.finalMessage();
        send({ type: "done", stopReason: final.stop_reason });
      } catch (err) {
        if (!request.signal.aborted) send({ type: "error", message: describeError(err).message });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a cancel.
        }
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Asks for JSON matching `schema` (structured outputs) and returns the parsed result. */
export async function generateJson<S extends z.ZodType>(
  request: Request,
  req: ClaudeRequest,
  schema: S,
): Promise<z.infer<S>> {
  // Streamed (and collected with finalMessage) so long quizzes don't run into HTTP timeouts.
  const message = await getClient()
    .beta.messages.stream(
      { ...baseParams(req), output_config: { effort: req.effort, format: betaZodOutputFormat(schema) } },
      { signal: request.signal },
    )
    .finalMessage();
  if (message.stop_reason === "refusal") {
    throw new UserFacingError("模型拒绝了这个请求，请调整内容后重试。", 422);
  }
  if (message.stop_reason === "max_tokens") {
    throw new UserFacingError("输出太长被截断了，请减少数量后重试。", 422);
  }
  if (message.parsed_output == null) {
    throw new UserFacingError("模型返回的内容无法解析，请重试。", 502);
  }
  return message.parsed_output as z.infer<S>;
}

/** Validates the JSON body with `schema`, runs `handler`, and maps errors to JSON responses. */
export async function handleJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  handler: (body: z.infer<S>) => Promise<unknown>,
): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "请求体不是有效的 JSON。" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: `请求参数无效：${z.prettifyError(parsed.error)}` }, { status: 400 });
  }
  try {
    return Response.json(await handler(parsed.data));
  } catch (err) {
    const { status, message } = describeError(err);
    return Response.json({ error: message }, { status });
  }
}

/** Like handleJson, for routes that return a stream. */
export async function handleStream<S extends z.ZodType>(
  request: Request,
  schema: S,
  handler: (body: z.infer<S>) => Response,
): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "请求体不是有效的 JSON。" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: `请求参数无效：${z.prettifyError(parsed.error)}` }, { status: 400 });
  }
  return handler(parsed.data);
}
