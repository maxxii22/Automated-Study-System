import type { ExamQuestion, RescueAttempt, RescueStatus } from "@automated-study-system/shared";
import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";

function toJsonValue<T>(value: T) {
  return value as Prisma.InputJsonValue;
}

function toRescueAttempt(record: {
  id: string;
  studySetId: string;
  examSessionId: string;
  triggerType: string;
  status: string;
  sourceQuestionId: string;
  sourceQuestion: string;
  sourceAnswer: string;
  concept: string;
  diagnosis: string;
  microLesson: string;
  sourceSupport: string | null;
  retryQuestion: unknown;
  idealRetryAnswer: string;
  retryUserAnswer: string | null;
  retryFeedback: string | null;
  retryScore: number | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}): RescueAttempt {
  return {
    id: record.id,
    studySetId: record.studySetId,
    examSessionId: record.examSessionId,
    triggerType: record.triggerType as "exam_turn",
    status: record.status as RescueStatus,
    sourceQuestionId: record.sourceQuestionId,
    sourceQuestion: record.sourceQuestion,
    sourceAnswer: record.sourceAnswer,
    concept: record.concept,
    diagnosis: record.diagnosis,
    microLesson: record.microLesson,
    sourceSupport: record.sourceSupport ?? undefined,
    retryQuestion: record.retryQuestion as ExamQuestion,
    idealRetryAnswer: record.idealRetryAnswer,
    retryUserAnswer: record.retryUserAnswer ?? undefined,
    retryFeedback: record.retryFeedback ?? undefined,
    retryScore: record.retryScore ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString()
  };
}

export async function listRescueAttempts(ownerId: string, studySetId: string, examSessionId?: string) {
  const records = await prisma.rescueAttempt.findMany({
    where: {
      ownerId,
      studySetId,
      examSessionId
    },
    orderBy: [{ createdAt: "desc" }]
  });

  return records.map(toRescueAttempt);
}

export async function getRescueAttempt(ownerId: string, studySetId: string, rescueId: string) {
  const record = await prisma.rescueAttempt.findFirst({
    where: {
      id: rescueId,
      ownerId,
      studySetId
    }
  });

  return record ? toRescueAttempt(record) : null;
}

export async function findExistingRescueAttempt(
  ownerId: string,
  studySetId: string,
  examSessionId: string,
  sourceQuestionId: string
) {
  const record = await prisma.rescueAttempt.findFirst({
    where: {
      ownerId,
      studySetId,
      examSessionId,
      sourceQuestionId
    }
  });

  return record ? toRescueAttempt(record) : null;
}

export async function createRescueAttempt(payload: {
  ownerId: string;
  studySetId: string;
  examSessionId: string;
  sourceQuestionId: string;
  sourceQuestion: string;
  sourceAnswer: string;
  concept: string;
  diagnosis: string;
  microLesson: string;
  sourceSupport?: string;
  retryQuestion: ExamQuestion;
  idealRetryAnswer: string;
}) {
  const record = await prisma.rescueAttempt.create({
    data: {
      ownerId: payload.ownerId,
      studySetId: payload.studySetId,
      examSessionId: payload.examSessionId,
      triggerType: "exam_turn",
      status: "open",
      sourceQuestionId: payload.sourceQuestionId,
      sourceQuestion: payload.sourceQuestion,
      sourceAnswer: payload.sourceAnswer,
      concept: payload.concept,
      diagnosis: payload.diagnosis,
      microLesson: payload.microLesson,
      sourceSupport: payload.sourceSupport,
      retryQuestion: toJsonValue(payload.retryQuestion),
      idealRetryAnswer: payload.idealRetryAnswer
    }
  });

  return toRescueAttempt(record);
}

export async function saveRescueAttemptRetry(payload: {
  ownerId: string;
  studySetId: string;
  rescueId: string;
  userAnswer: string;
  score: number;
  feedback: string;
  recovered: boolean;
}) {
  const existing = await prisma.rescueAttempt.findFirst({
    where: {
      id: payload.rescueId,
      ownerId: payload.ownerId,
      studySetId: payload.studySetId
    }
  });

  if (!existing) {
    return null;
  }

  const record = await prisma.rescueAttempt.update({
    where: {
      id: existing.id
    },
    data: {
      retryUserAnswer: payload.userAnswer,
      retryScore: payload.score,
      retryFeedback: payload.feedback,
      status: payload.recovered ? "recovered" : "needs_more_help",
      resolvedAt: payload.recovered ? new Date() : null
    }
  });

  return toRescueAttempt(record);
}
