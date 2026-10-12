import { describe, expect, it } from "vitest";
import { digestDue, pendingForDigest } from "@/lib/digest";
import type { Digest, Segment } from "@/lib/types";

const seg = (startMs: number, endMs: number, text = "x".repeat(50)): Segment => ({ id: `${startMs}`, lectureId: "l", startMs, endMs, text });
const card = (startMs: number, endMs: number): Digest => ({ id: `${startMs}`, lectureId: "l", startMs, endMs, title: "", points: [] });

describe("pendingForDigest", () => {
  it("returns everything before the first card", () => {
    expect(pendingForDigest([seg(0, 5000), seg(5000, 9000)], [])).toHaveLength(2);
  });
  it("returns only segments that end after the last card", () => {
    const segments = [seg(0, 5000), seg(5000, 9000), seg(9000, 12000)];
    expect(pendingForDigest(segments, [card(0, 9000)]).map((s) => s.startMs)).toEqual([9000]);
  });
});

describe("digestDue", () => {
  it("waits until the interval has passed", () => {
    expect(digestDue([seg(0, 30_000), seg(30_000, 60_000)], 90_000, false)).toBe(false);
    expect(digestDue([seg(0, 30_000), seg(30_000, 60_000), seg(60_000, 95_000)], 90_000, false)).toBe(true);
  });
  it("needs enough text even when the interval passed", () => {
    expect(digestDue([seg(0, 100_000, "ok")], 90_000, false)).toBe(false);
  });
  it("flushes leftovers with less text when recording stops", () => {
    expect(digestDue([seg(0, 10_000, "x".repeat(45))], 90_000, true)).toBe(true);
    expect(digestDue([seg(0, 10_000, "hi")], 90_000, true)).toBe(false);
    expect(digestDue([], 90_000, true)).toBe(false);
  });
});
