import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, postStream } from "@/lib/client/api";

function ndjsonResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "application/x-ndjson" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("postStream", () => {
  it("assembles deltas split across chunk boundaries", async () => {
    vi.stubGlobal("fetch", async () =>
      ndjsonResponse(['{"type":"delta","text":"你好"}\n{"type":"de', 'lta","text":"，世界"}\n', '{"type":"done","stopReason":"end_turn"}\n']),
    );
    const updates: string[] = [];
    const result = await postStream("/api/x", {}, (t) => updates.push(t));
    expect(result).toEqual({ text: "你好，世界", stopReason: "end_turn" });
    expect(updates).toEqual(["你好", "你好，世界"]);
  });

  it("discards text when a fallback model takes over", async () => {
    vi.stubGlobal("fetch", async () =>
      ndjsonResponse(['{"type":"delta","text":"partial"}\n{"type":"reset"}\n{"type":"delta","text":"full"}\n{"type":"done","stopReason":"end_turn"}']),
    );
    const result = await postStream("/api/x", {}, () => undefined);
    expect(result.text).toBe("full");
  });

  it("raises stream errors as ApiError", async () => {
    vi.stubGlobal("fetch", async () => ndjsonResponse(['{"type":"delta","text":"a"}\n{"type":"error","message":"限流了"}\n']));
    await expect(postStream("/api/x", {}, () => undefined)).rejects.toThrow(new ApiError("限流了"));
  });

  it("treats a stream that ends without done as interrupted", async () => {
    vi.stubGlobal("fetch", async () => ndjsonResponse(['{"type":"delta","text":"a"}\n']));
    await expect(postStream("/api/x", {}, () => undefined)).rejects.toThrow(/中断/);
  });

  it("surfaces the server's JSON error for non-2xx responses", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "服务器未配置 ANTHROPIC_API_KEY" }, { status: 500 }));
    await expect(postStream("/api/x", {}, () => undefined)).rejects.toThrow("服务器未配置 ANTHROPIC_API_KEY");
  });
});
