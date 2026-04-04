import type { Request, Response } from "express";
import { z } from "zod";

import { getStudySet } from "../services/studySetRepository.js";
import { listExamSessions, upsertExamSession } from "../services/examSessionRepository.js";

const examQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  focusTopic: z.string().optional()
});

const examTurnSchema = z.object({
  questionId: z.string().min(1),
  question: z.string().min(1),
  focusTopic: z.string().optional(),
  userAnswer: z.string().min(1),
  idealAnswer: z.string().min(1),
  feedback: z.string().min(1),
  score: z.number(),
  classification: z.enum(["strong", "partial", "weak"]),
  weakTopics: z.array(z.string()),
  createdAt: z.string().min(1)
});

const examSummarySchema = z.object({
  totalQuestions: z.number().int().nonnegative(),
  averageScore: z.number(),
  weakTopics: z.array(z.string()),
  strongestTopic: z.string().optional()
});

const examSessionSchema = z.object({
  id: z.string().min(1),
  studySetId: z.string().min(1),
  startedAt: z.string().min(1),
  completedAt: z.string().optional(),
  completed: z.boolean(),
  currentQuestion: examQuestionSchema,
  turns: z.array(examTurnSchema),
  weakTopics: z.array(z.string()),
  cumulativeScore: z.number(),
  totalQuestionsTarget: z.number().int().min(1).max(20),
  summary: examSummarySchema.optional()
});

export async function listExamSessionsController(request: Request, response: Response) {
  const studySetId = String(request.params.id);
  const studySet = await getStudySet(request.authUser!.id, studySetId);

  if (!studySet) {
    return response.status(404).json({ message: "Study set not found." });
  }

  const items = await listExamSessions(request.authUser!.id, studySetId);
  return response.json({ items });
}

export async function saveExamSessionController(request: Request, response: Response) {
  const studySetId = String(request.params.id);
  const sessionId = String(request.params.sessionId);
  const studySet = await getStudySet(request.authUser!.id, studySetId);

  if (!studySet) {
    return response.status(404).json({ message: "Study set not found." });
  }

  const parsed = examSessionSchema.safeParse(request.body.session);

  if (!parsed.success) {
    return response.status(400).json({
      message: "Invalid exam session payload.",
      issues: parsed.error.flatten()
    });
  }

  if (parsed.data.studySetId !== studySetId) {
    return response.status(400).json({
      message: "Exam session study set does not match the route."
    });
  }

  if (parsed.data.id !== sessionId) {
    return response.status(400).json({
      message: "Exam session id does not match the route."
    });
  }

  try {
    const saved = await upsertExamSession(request.authUser!.id, parsed.data);
    return response.json({ session: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save exam session.";
    const status = /another user/i.test(message) ? 409 : 500;

    return response.status(status).json({ message });
  }
}
