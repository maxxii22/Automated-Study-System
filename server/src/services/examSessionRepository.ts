import type { ExamQuestion, ExamSession, ExamSummary, ExamTurnResult } from "@automated-study-system/shared";

import { Prisma } from "../../generated/prisma/index.js";

import { prisma } from "../lib/prisma.js";

function toExamSession(record: {
  id: string;
  studySetId: string;
  completed: boolean;
  currentQuestion: unknown;
  turns: unknown;
  weakTopics: string[];
  cumulativeScore: number;
  totalQuestionsTarget: number;
  summary: unknown;
  startedAt: Date;
  completedAt: Date | null;
}): ExamSession {
  return {
    id: record.id,
    studySetId: record.studySetId,
    startedAt: record.startedAt.toISOString(),
    completedAt: record.completedAt?.toISOString(),
    completed: record.completed,
    currentQuestion: record.currentQuestion as ExamQuestion,
    turns: record.turns as ExamTurnResult[],
    weakTopics: record.weakTopics,
    cumulativeScore: record.cumulativeScore,
    totalQuestionsTarget: record.totalQuestionsTarget,
    summary: (record.summary as ExamSummary | null) ?? undefined
  };
}

function toJsonValue<T>(value: T) {
  return value as Prisma.InputJsonValue;
}

export async function listExamSessions(ownerId: string, studySetId: string) {
  const records = await prisma.examSession.findMany({
    where: { studySetId, ownerId },
    orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }]
  });

  return records.map(toExamSession);
}

export async function getExamSession(ownerId: string, studySetId: string, sessionId: string) {
  const record = await prisma.examSession.findFirst({
    where: {
      id: sessionId,
      studySetId,
      ownerId
    }
  });

  return record ? toExamSession(record) : null;
}

export async function upsertExamSession(ownerId: string, session: ExamSession) {
  const existing = await prisma.examSession.findUnique({
    where: { id: session.id },
    select: { id: true, ownerId: true }
  });

  if (existing && existing.ownerId !== ownerId) {
    throw new Error("Exam session id already belongs to another user.");
  }

  const payload = {
    ownerId,
    studySetId: session.studySetId,
    completed: session.completed,
    currentQuestion: session.currentQuestion,
    turns: session.turns,
    weakTopics: session.weakTopics,
    cumulativeScore: session.cumulativeScore,
    totalQuestionsTarget: session.totalQuestionsTarget,
    summary: session.summary ? toJsonValue(session.summary) : Prisma.JsonNull,
    startedAt: new Date(session.startedAt),
    completedAt: session.completedAt ? new Date(session.completedAt) : null
  };

  const record = existing
    ? await prisma.examSession.update({
        where: { id: session.id },
        data: payload
      })
    : await prisma.examSession.create({
        data: {
          id: session.id,
          ...payload
        }
      });

  return toExamSession(record);
}
