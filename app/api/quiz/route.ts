import { QuizRequest, type QuizResponse } from "@/lib/api-schemas";
import { UserFacingError, generateJson, handleJson } from "@/lib/server/claude";
import { QuizOutput, finalizeQuiz } from "@/lib/server/outputs";
import { quizPrompt } from "@/lib/server/prompts";

export const maxDuration = 300;

/** Generates a multiple-choice quiz on the lecture. */
export function POST(request: Request) {
  return handleJson(request, QuizRequest, async (body): Promise<QuizResponse> => {
    if (body.segments.length === 0) {
      throw new UserFacingError("还没有讲课转写内容，无法出题。", 400);
    }
    const prompt = quizPrompt(body, body.summary, body.count, body.difficulty, body.avoid);
    // High effort: a wrong answer key is worse than a slow quiz.
    const out = await generateJson(request, { ...prompt, maxTokens: 32000, effort: "high" }, QuizOutput);
    const durationMs = body.segments.at(-1)?.endMs ?? 0;
    const quiz = finalizeQuiz(out, durationMs);
    if (quiz.questions.length === 0) throw new UserFacingError("没有生成有效的题目，请重试。", 502);
    return quiz;
  });
}
