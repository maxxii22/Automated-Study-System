import type {
  CreateRescueAttemptResponse,
  ExamSession,
  ExamTurnResult,
  ListRescueAttemptsResponse,
  SubmitRescueRetryResponse
} from "@automated-study-system/shared";

import { getExamSession } from "./examSessionRepository.js";
import { evaluateRescueRetry, generateRescueAttempt as generateRescueAttemptPayload } from "./geminiService.js";
import {
  createRescueAttempt,
  findExistingRescueAttempt,
  getRescueAttempt,
  listRescueAttempts,
  saveRescueAttemptRetry
} from "./rescueAttemptRepository.js";
import { getStudySetEvaluationContext } from "./studySetRepository.js";

function isEligibleForRescue(classification: string, score: number) {
  return classification === "weak" || (classification === "partial" && score < 60);
}

export async function listRescueAttemptsForStudySet(
  ownerId: string,
  studySetId: string,
  examSessionId?: string
): Promise<ListRescueAttemptsResponse> {
  const items = await listRescueAttempts(ownerId, studySetId, examSessionId);
  return { items };
}

export async function createOrReuseRescueAttemptForSession(
  ownerId: string,
  studySetId: string,
  examSessionId: string
): Promise<CreateRescueAttemptResponse> {
  const [studySet, session] = await Promise.all([
    getStudySetEvaluationContext(ownerId, studySetId),
    getExamSession(ownerId, studySetId, examSessionId)
  ]);

  if (!studySet) {
    throw new Error("Study set not found.");
  }

  if (!session) {
    throw new Error("Exam session not found.");
  }

  const latestTurn = session.turns.at(-1);

  if (!latestTurn) {
    throw new Error("There is no recent exam answer to rescue.");
  }

  if (!isEligibleForRescue(latestTurn.classification, latestTurn.score)) {
    throw new Error("Rescue Mode is only available after a weak or low partial answer.");
  }

  return createOrReuseRescueAttemptFromContext({
    ownerId,
    studySetId,
    studySet,
    session,
    latestTurn
  });
}

export async function createOrReuseRescueAttemptFromContext(payload: {
  ownerId: string;
  studySetId: string;
  studySet: NonNullable<Awaited<ReturnType<typeof getStudySetEvaluationContext>>>;
  session: ExamSession;
  latestTurn: ExamTurnResult;
}): Promise<CreateRescueAttemptResponse> {
  const existing = await findExistingRescueAttempt(
    payload.ownerId,
    payload.studySetId,
    payload.session.id,
    payload.latestTurn.questionId
  );

  if (existing) {
    return { attempt: existing };
  }

  const generated = await generateRescueAttemptPayload({
    studySet: payload.studySet,
    session: payload.session,
    latestTurn: payload.latestTurn
  });

  const attempt = await createRescueAttempt({
    ownerId: payload.ownerId,
    studySetId: payload.studySetId,
    examSessionId: payload.session.id,
    sourceQuestionId: payload.latestTurn.questionId,
    sourceQuestion: payload.latestTurn.question,
    sourceAnswer: payload.latestTurn.userAnswer,
    concept: generated.concept,
    diagnosis: generated.diagnosis,
    microLesson: generated.microLesson,
    sourceSupport: generated.sourceSupport,
    retryQuestion: generated.retryQuestion,
    idealRetryAnswer: generated.idealRetryAnswer
  });

  return { attempt };
}

export async function submitRescueRetryForAttempt(
  ownerId: string,
  studySetId: string,
  rescueId: string,
  userAnswer: string
): Promise<SubmitRescueRetryResponse> {
  const attempt = await getRescueAttempt(ownerId, studySetId, rescueId);

  if (!attempt) {
    throw new Error("Rescue attempt not found.");
  }

  const studySet = await getStudySetEvaluationContext(ownerId, studySetId);

  if (!studySet) {
    throw new Error("Study set not found.");
  }

  const evaluation = await evaluateRescueRetry({
    studySet,
    concept: attempt.concept,
    microLesson: attempt.microLesson,
    retryQuestion: attempt.retryQuestion,
    idealRetryAnswer: attempt.idealRetryAnswer,
    userAnswer
  });

  const updatedAttempt = await saveRescueAttemptRetry({
    ownerId,
    studySetId,
    rescueId,
    userAnswer,
    score: Math.round(evaluation.score),
    feedback: evaluation.feedback,
    recovered: evaluation.recovered
  });

  if (!updatedAttempt) {
    throw new Error("Could not save the rescue retry.");
  }

  return {
    attempt: updatedAttempt,
    canResumeExam: true
  };
}
