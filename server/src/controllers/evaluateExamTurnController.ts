import type { Request, Response } from "express";
import type { StudySet } from "@automated-study-system/shared";
import { z } from "zod";

import { evaluateExamTurn } from "../services/geminiService.js";
import { isGeminiRateLimitError, isGeminiTimeoutError } from "../services/geminiApi.js";
import { evaluateExamTurnLocally } from "../services/examFallbackService.js";
import { getStudySet } from "../services/studySetRepository.js";

const examQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(5),
  focusTopic: z.string().optional()
});

const examTurnSchema = z.object({
  questionId: z.string().min(1),
  question: z.string().min(5),
  focusTopic: z.string().optional(),
  userAnswer: z.string().min(1),
  idealAnswer: z.string().min(1),
  feedback: z.string().min(1),
  score: z.number().min(0).max(100),
  classification: z.enum(["strong", "partial", "weak"]),
  weakTopics: z.array(z.string()),
  createdAt: z.string().min(1)
});

const evaluateExamTurnFields = {
  currentQuestion: examQuestionSchema,
  userAnswer: z.string().min(3).max(5000),
  turns: z.array(examTurnSchema).max(20),
  weakTopics: z.array(z.string()).max(20),
  totalQuestionsTarget: z.number().int().min(3).max(10).optional()
};

const evaluateExamTurnSchema = z.union([
  z.object({
    studySetId: z.string().min(1),
    ...evaluateExamTurnFields
  }),
  z.object({
    studySet: z
      .object({
        id: z.string().min(1)
      })
      .passthrough(),
    ...evaluateExamTurnFields
  })
]);

type EvaluateExamTurnInput = {
  studySet: StudySet;
  currentQuestion: z.infer<typeof examQuestionSchema>;
  userAnswer: string;
  turns: z.infer<typeof examTurnSchema>[];
  weakTopics: string[];
  totalQuestionsTarget?: number;
};

export async function evaluateExamTurnController(request: Request, response: Response) {
  const parsed = evaluateExamTurnSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      message: "Invalid exam turn payload.",
      issues: parsed.error.flatten()
    });
  }

  const studySetId = "studySetId" in parsed.data ? parsed.data.studySetId : parsed.data.studySet.id;
  const studySet = await getStudySet(request.authUser!.id, studySetId);

  if (!studySet) {
    return response.status(404).json({
      message: "Study set not found."
    });
  }

  const payload: EvaluateExamTurnInput = {
    studySet,
    currentQuestion: parsed.data.currentQuestion,
    userAnswer: parsed.data.userAnswer,
    turns: parsed.data.turns,
    weakTopics: parsed.data.weakTopics,
    totalQuestionsTarget: parsed.data.totalQuestionsTarget
  };

  try {
    const examResponse = await evaluateExamTurn(payload);
    return response.status(200).json(examResponse);
  } catch (error) {
    if (isGeminiRateLimitError(error) || isGeminiTimeoutError(error)) {
      const fallbackResponse = evaluateExamTurnLocally(payload);
      response.setHeader("X-Exam-Evaluation-Mode", "fallback");
      response.setHeader("X-Exam-Evaluation-Reason", isGeminiTimeoutError(error) ? "gemini_timeout" : "gemini_rate_limit");
      return response.status(200).json(fallbackResponse);
    }

    return response.status(500).json({
      message: error instanceof Error ? error.message : "Exam evaluation failed."
    });
  }
}
