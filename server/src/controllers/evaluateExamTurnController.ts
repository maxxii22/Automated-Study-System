import type { Request, Response } from "express";
import type { ExamQuestion, ExamSession, ExamSummary, ExamTurnResult, StudySet } from "@automated-study-system/shared";
import { z } from "zod";

import { evaluateExamTurn } from "../services/geminiService.js";
import { isGeminiRateLimitError, isGeminiTimeoutError } from "../services/geminiApi.js";
import { evaluateExamTurnLocally } from "../services/examFallbackService.js";
import { upsertExamSession } from "../services/examSessionRepository.js";
import { getStudySetEvaluationContext } from "../services/studySetRepository.js";

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

const evaluateExamTurnSchema = z.object({
  studySetId: z.string().min(1),
  sessionId: z.string().min(1),
  sessionStartedAt: z.string().min(1),
  currentQuestion: examQuestionSchema,
  userAnswer: z.string().min(3).max(5000),
  turns: z.array(examTurnSchema).max(20),
  weakTopics: z.array(z.string()).max(20),
  totalQuestionsTarget: z.number().int().min(3).max(10).optional()
});

type EvaluateExamTurnInput = {
  studySet: StudySet;
  currentQuestion: z.infer<typeof examQuestionSchema>;
  userAnswer: string;
  turns: z.infer<typeof examTurnSchema>[];
  weakTopics: string[];
  totalQuestionsTarget?: number;
};

function buildExamSummary(turns: ExamTurnResult[]): ExamSummary {
  const averageScore = turns.length > 0 ? Math.round(turns.reduce((total, turn) => total + turn.score, 0) / turns.length) : 0;
  const topicCounts = new Map<string, number>();

  turns.forEach((turn) => {
    turn.weakTopics.forEach((topic) => {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    });
  });

  const sortedTopics = [...topicCounts.entries()].sort((left, right) => right[1] - left[1]).map(([topic]) => topic);
  const strongestTurn = [...turns].sort((left, right) => right.score - left.score)[0];

  return {
    totalQuestions: turns.length,
    averageScore,
    weakTopics: sortedTopics,
    strongestTopic: strongestTurn?.weakTopics[0] ? undefined : strongestTurn?.focusTopic
  };
}

function buildPersistedSession(payload: {
  studySetId: string;
  sessionId: string;
  sessionStartedAt: string;
  currentQuestion: ExamQuestion;
  turns: ExamTurnResult[];
  weakTopics: string[];
  totalQuestionsTarget: number;
  nextQuestion?: ExamQuestion;
  shouldEnd: boolean;
}): ExamSession {
  const cumulativeScore = payload.turns.reduce((total, turn) => total + turn.score, 0);
  const completedAt = payload.shouldEnd ? new Date().toISOString() : undefined;

  return {
    id: payload.sessionId,
    studySetId: payload.studySetId,
    startedAt: payload.sessionStartedAt,
    completed: payload.shouldEnd,
    completedAt,
    currentQuestion: payload.nextQuestion ?? payload.currentQuestion,
    turns: payload.turns,
    weakTopics: payload.weakTopics,
    cumulativeScore,
    totalQuestionsTarget: payload.totalQuestionsTarget,
    summary: payload.shouldEnd ? buildExamSummary(payload.turns) : undefined
  };
}

export async function evaluateExamTurnController(request: Request, response: Response) {
  const parsed = evaluateExamTurnSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      message: "Invalid exam turn payload.",
      issues: parsed.error.flatten()
    });
  }

  const studySet = await getStudySetEvaluationContext(request.authUser!.id, parsed.data.studySetId);

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
    const totalQuestionsTarget = parsed.data.totalQuestionsTarget ?? 5;
    const shouldEnd =
      examResponse.shouldEnd || parsed.data.turns.length + 1 >= totalQuestionsTarget || !examResponse.nextQuestion;
    const nextTurns = [...parsed.data.turns, examResponse.result];
    const persistedSession = await upsertExamSession(
      request.authUser!.id,
      buildPersistedSession({
        studySetId: parsed.data.studySetId,
        sessionId: parsed.data.sessionId,
        sessionStartedAt: parsed.data.sessionStartedAt,
        currentQuestion: parsed.data.currentQuestion,
        turns: nextTurns,
        weakTopics: examResponse.weakTopics,
        totalQuestionsTarget,
        nextQuestion: examResponse.nextQuestion,
        shouldEnd
      })
    );

    return response.status(200).json({
      ...examResponse,
      shouldEnd,
      session: persistedSession
    });
  } catch (error) {
    if (isGeminiRateLimitError(error) || isGeminiTimeoutError(error)) {
      const fallbackResponse = evaluateExamTurnLocally(payload);
      const totalQuestionsTarget = parsed.data.totalQuestionsTarget ?? 5;
      const shouldEnd =
        fallbackResponse.shouldEnd ||
        parsed.data.turns.length + 1 >= totalQuestionsTarget ||
        !fallbackResponse.nextQuestion;
      const nextTurns = [...parsed.data.turns, fallbackResponse.result];
      const persistedSession = await upsertExamSession(
        request.authUser!.id,
        buildPersistedSession({
          studySetId: parsed.data.studySetId,
          sessionId: parsed.data.sessionId,
          sessionStartedAt: parsed.data.sessionStartedAt,
          currentQuestion: parsed.data.currentQuestion,
          turns: nextTurns,
          weakTopics: fallbackResponse.weakTopics,
          totalQuestionsTarget,
          nextQuestion: fallbackResponse.nextQuestion,
          shouldEnd
        })
      );

      response.setHeader("X-Exam-Evaluation-Mode", "fallback");
      response.setHeader("X-Exam-Evaluation-Reason", isGeminiTimeoutError(error) ? "gemini_timeout" : "gemini_rate_limit");

      return response.status(200).json({
        ...fallbackResponse,
        shouldEnd,
        session: persistedSession
      });
    }

    if (error instanceof Error && /another user/i.test(error.message)) {
      return response.status(409).json({
        message: error.message
      });
    }

    return response.status(500).json({
      message: error instanceof Error ? error.message : "Exam evaluation failed."
    });
  }
}
