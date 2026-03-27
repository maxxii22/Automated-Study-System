import type { Request, Response } from "express";
import { z } from "zod";

import { evaluateExamTurn } from "../services/geminiService.js";
import { isGeminiRateLimitError } from "../services/geminiApi.js";
import { evaluateExamTurnLocally } from "../services/examFallbackService.js";

const examQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(5),
  focusTopic: z.string().optional()
});

const examTurnSchema = z.object({
  questionId: z.string().min(1),
  question: z.string().min(5),
  userAnswer: z.string().min(1),
  idealAnswer: z.string().min(1),
  feedback: z.string().min(1),
  score: z.number().min(0).max(100),
  classification: z.enum(["strong", "partial", "weak"]),
  weakTopics: z.array(z.string()),
  createdAt: z.string().min(1)
});

const studySetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sourceText: z.string(),
  sourceType: z.enum(["text", "pdf"]),
  sourceFileName: z.string().optional(),
  summary: z.string(),
  studyGuide: z.string(),
  keyConcepts: z.array(z.string()),
  flashcards: z.array(
    z.object({
      id: z.string().min(1),
      question: z.string().min(1),
      answer: z.string().min(1),
      order: z.number().int()
    })
  ),
  flashcardCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const evaluateExamTurnSchema = z.object({
  studySet: studySetSchema,
  currentQuestion: examQuestionSchema,
  userAnswer: z.string().min(3).max(5000),
  turns: z.array(examTurnSchema).max(20),
  weakTopics: z.array(z.string()).max(20),
  totalQuestionsTarget: z.number().int().min(3).max(10).optional()
});

export async function evaluateExamTurnController(request: Request, response: Response) {
  const parsed = evaluateExamTurnSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      message: "Invalid exam turn payload.",
      issues: parsed.error.flatten()
    });
  }

  try {
    const examResponse = await evaluateExamTurn(parsed.data);
    return response.status(200).json(examResponse);
  } catch (error) {
    if (isGeminiRateLimitError(error)) {
      const fallbackResponse = evaluateExamTurnLocally(parsed.data);
      response.setHeader("X-Exam-Evaluation-Mode", "fallback");
      response.setHeader("X-Exam-Evaluation-Reason", "gemini_rate_limit");
      return response.status(200).json(fallbackResponse);
    }

    return response.status(500).json({
      message: error instanceof Error ? error.message : "Exam evaluation failed."
    });
  }
}
