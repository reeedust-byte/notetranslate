import { describe, expect, it } from "vitest";
import { finalizeQuiz } from "@/lib/server/outputs";

const q = (over: Partial<Parameters<typeof finalizeQuiz>[0]["questions"][number]> = {}) => ({
  question: "What does the learning rate control?",
  options: ["Step size", "Batch size", "Number of layers", "Loss function"],
  answer_index: 0,
  explanation: "It scales each update.",
  timestamp: "02:10",
  concept: "learning rate",
  ...over,
});

/** Deterministic pseudo-random sequence for shuffling. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe("finalizeQuiz", () => {
  it("keeps the correct answer attached to the right option after shuffling", () => {
    for (let s = 1; s < 50; s++) {
      const out = finalizeQuiz({ questions: [q()] }, 600_000, seeded(s));
      const item = out.questions[0];
      expect(item.options).toHaveLength(4);
      expect(item.options[item.answerIndex]).toBe("Step size");
      expect([...item.options].sort()).toEqual([...q().options].sort());
    }
  });

  it("spreads the correct answer over positions", () => {
    const rand = seeded(7);
    const positions = new Set<number>();
    for (let i = 0; i < 40; i++) positions.add(finalizeQuiz({ questions: [q()] }, 600_000, rand).questions[0].answerIndex);
    expect(positions.size).toBe(4);
  });

  it("does not shuffle true/false questions", () => {
    const out = finalizeQuiz({ questions: [q({ options: ["正确", "错误"], answer_index: 1 })] }, 600_000, () => 0);
    expect(out.questions[0].options).toEqual(["正确", "错误"]);
    expect(out.questions[0].answerIndex).toBe(1);
  });

  it("converts timestamps and drops ones past the end of the lecture", () => {
    const out = finalizeQuiz({ questions: [q({ timestamp: "02:10" }), q({ timestamp: "90:00" }), q({ timestamp: "" })] }, 600_000);
    expect(out.questions.map((x) => x.atMs)).toEqual([130_000, null, null]);
  });

  it("drops malformed questions", () => {
    const out = finalizeQuiz(
      {
        questions: [
          q({ answer_index: 4 }),
          q({ answer_index: -1 }),
          q({ options: ["only one"] }),
          q({ options: ["a", " ", "c", "d"] }),
          q({ question: "  " }),
          q(),
        ],
      },
      600_000,
    );
    expect(out.questions).toHaveLength(1);
  });
});
