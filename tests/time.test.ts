import { describe, expect, it } from "vitest";
import { formatMs, linkifyTimestamps, parseTimestamp } from "@/lib/time";

describe("formatMs", () => {
  it("formats minutes and seconds", () => {
    expect(formatMs(0)).toBe("00:00");
    expect(formatMs(65_400)).toBe("01:05");
    expect(formatMs(59 * 60_000 + 59_999)).toBe("59:59");
  });
  it("adds hours past the first hour", () => {
    expect(formatMs(3_600_000)).toBe("1:00:00");
    expect(formatMs(3_600_000 + 5 * 60_000 + 7_000)).toBe("1:05:07");
  });
  it("clamps negatives", () => {
    expect(formatMs(-500)).toBe("00:00");
  });
});

describe("parseTimestamp", () => {
  it("round-trips formatMs", () => {
    for (const ms of [0, 7_000, 754_000, 3_725_000]) expect(parseTimestamp(formatMs(ms))).toBe(ms);
  });
  it("accepts single-digit minutes and minutes over 60", () => {
    expect(parseTimestamp("2:03")).toBe(123_000);
    expect(parseTimestamp("75:00")).toBe(4_500_000);
  });
  it("rejects malformed input", () => {
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("12:60")).toBeNull();
    expect(parseTimestamp("1:60:00")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
  });
});

describe("linkifyTimestamps", () => {
  it("turns bracketed timestamps into seek links", () => {
    expect(linkifyTimestamps("见 [12:34] 和 [1:02:03]。")).toBe("见 [12:34](#t=754000) 和 [1:02:03](#t=3723000)。");
  });
  it("leaves existing links and invalid stamps alone", () => {
    expect(linkifyTimestamps("[12:34](http://x) [12:99]")).toBe("[12:34](http://x) [12:99]");
  });
});
