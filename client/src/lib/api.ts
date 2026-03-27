import { io, type Socket } from "socket.io-client";

import type {
  CreateStudyJobResponse,
  CreateRescueAttemptResponse,
  EvaluateExamTurnRequest,
  EvaluateExamTurnResponse,
  ExamQuestion,
  ExamSession,
  ExamSummary,
  ExamTurnResult,
  Flashcard,
  GenerateStudySetResponse,
  GetStudyJobResponse,
  ListExamSessionsResponse,
  ListRescueAttemptsResponse,
  PaginatedFlashcardsResponse,
  PaginatedStudySetsResponse,
  RecoverStudyJobsResponse,
  RescueAttempt,
  RetryStudyJobResponse,
  SaveExamSessionResponse,
  SubmitRescueRetryResponse,
  StudyJobOpsSummaryResponse,
  StudyJobEvent,
  StudySet,
  StudySetJob
} from "@automated-study-system/shared";
import { getAccessToken } from "./supabase";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? "/api" : "http://localhost:4000/api");
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? API_BASE_URL.replace(/\/api$/, "");

let sharedSocket: Socket | null = null;

async function buildAuthHeaders(headers?: HeadersInit) {
  const accessToken = await getAccessToken();
  const nextHeaders = new Headers(headers);

  if (accessToken) {
    nextHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  return nextHeaders;
}

async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = await buildAuthHeaders(init?.headers);
  return fetch(input, {
    ...init,
    headers
  });
}

async function getSocket() {
  const accessToken = await getAccessToken();

  if (!sharedSocket) {
    sharedSocket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      auth: accessToken ? { token: accessToken } : undefined,
      autoConnect: false
    });
  } else {
    sharedSocket.auth = accessToken ? { token: accessToken } : {};
  }

  if (!sharedSocket.connected) {
    sharedSocket.connect();
  }

  return sharedSocket;
}

async function parseJsonError(response: Response, fallback: string) {
  const error = (await response.json().catch(() => null)) as { message?: string } | null;
  return error?.message ?? fallback;
}

export async function fetchStudySets(cursor?: string, limit = 10): Promise<PaginatedStudySetsResponse> {
  const searchParams = new URLSearchParams();

  if (cursor) {
    searchParams.set("cursor", cursor);
  }

  searchParams.set("limit", String(limit));

  const response = await authenticatedFetch(`${API_BASE_URL}/study-sets?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not load saved study sets."));
  }

  return response.json() as Promise<PaginatedStudySetsResponse>;
}

export async function fetchStudySet(id: string): Promise<StudySet> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-sets/${id}`);

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not load study set."));
  }

  return response.json() as Promise<StudySet>;
}

export async function fetchStudySetFlashcards(
  id: string,
  cursor?: string,
  limit = 10
): Promise<PaginatedFlashcardsResponse> {
  const searchParams = new URLSearchParams();

  if (cursor) {
    searchParams.set("cursor", cursor);
  }

  searchParams.set("limit", String(limit));

  const response = await authenticatedFetch(`${API_BASE_URL}/study-sets/${id}/flashcards?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not load flashcards."));
  }

  return response.json() as Promise<PaginatedFlashcardsResponse>;
}

export async function createTextStudyJob(payload: { title: string; sourceText: string }): Promise<CreateStudyJobResponse> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...payload,
      sourceType: "text"
    })
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Failed to queue text study job."));
  }

  return response.json() as Promise<CreateStudyJobResponse>;
}

export async function saveStudySet(
  payload: { title: string; sourceText: string; sourceType: "text" | "pdf"; sourceFileName?: string } & GenerateStudySetResponse
): Promise<StudySet> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-sets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Failed to save study set."));
  }

  return response.json() as Promise<StudySet>;
}

export async function createPdfStudyJob(payload: { title: string }, sourceFile: File): Promise<CreateStudyJobResponse> {
  const formData = new FormData();
  formData.append("title", payload.title);
  formData.append("sourceFile", sourceFile);

  const response = await authenticatedFetch(`${API_BASE_URL}/study-jobs`, {
    method: "POST",
    body: formData,
    headers: undefined
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Failed to queue PDF study job."));
  }

  return response.json() as Promise<CreateStudyJobResponse>;
}

export async function fetchStudyJob(jobId: string): Promise<GetStudyJobResponse> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-jobs/${jobId}`);

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not load study job."));
  }

  return response.json() as Promise<GetStudyJobResponse>;
}

type StudyJobSubscriptionOptions = {
  onConnect?: () => void;
  onDisconnect?: () => void;
};

export function subscribeToStudyJob(
  jobId: string,
  listener: (event: StudyJobEvent) => void,
  options?: StudyJobSubscriptionOptions
): () => void {
  const eventTypes: StudyJobEvent["type"][] = [
    "study-job:queued",
    "study-job:progress",
    "study-job:completed",
    "study-job:failed"
  ];
  let socket: Socket | null = null;
  let disposed = false;
  const resubscribe = () => {
    socket?.emit("study-job:subscribe", jobId);
    options?.onConnect?.();
  };
  const handleDisconnect = () => {
    options?.onDisconnect?.();
  };

  void getSocket().then((nextSocket) => {
    if (disposed) {
      return;
    }

    socket = nextSocket;
    resubscribe();
    socket.on("connect", resubscribe);
    socket.on("disconnect", handleDisconnect);
    eventTypes.forEach((eventType) => {
      socket?.on(eventType, listener);
    });
  });

  return () => {
    disposed = true;
    socket?.off("connect", resubscribe);
    socket?.off("disconnect", handleDisconnect);
    eventTypes.forEach((eventType) => {
      socket?.off(eventType, listener);
    });
    socket?.emit("study-job:unsubscribe", jobId);
  };
}

export async function deleteStudySet(id: string): Promise<void> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-sets/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not delete the study set."));
  }
}

export async function evaluateExamTurn(
  payload: EvaluateExamTurnRequest
): Promise<EvaluateExamTurnResponse> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-sets/exam-turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Failed to evaluate exam answer."));
  }

  return response.json() as Promise<EvaluateExamTurnResponse>;
}

export async function transcribeExamAnswer(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  const extension = audioBlob.type.includes("mp4") ? "m4a" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
  formData.append("audioFile", new File([audioBlob], `oral-answer.${extension}`, { type: audioBlob.type || "audio/webm" }));

  const response = await authenticatedFetch(`${API_BASE_URL}/study-sets/transcribe-answer`, {
    method: "POST",
    body: formData,
    headers: undefined
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Failed to transcribe oral answer."));
  }

  const payload = (await response.json()) as { transcript: string };
  return payload.transcript;
}

export async function fetchExamSessions(studySetId: string): Promise<ExamSession[]> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-sets/${studySetId}/exam-sessions`);

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not load exam sessions."));
  }

  const payload = (await response.json()) as ListExamSessionsResponse;
  return payload.items;
}

export async function fetchRescueAttempts(studySetId: string, examSessionId?: string): Promise<RescueAttempt[]> {
  const searchParams = new URLSearchParams();

  if (examSessionId) {
    searchParams.set("examSessionId", examSessionId);
  }

  const response = await authenticatedFetch(
    `${API_BASE_URL}/study-sets/${studySetId}/rescue-attempts${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`
  );

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not load rescue attempts."));
  }

  const payload = (await response.json()) as ListRescueAttemptsResponse;
  return payload.items;
}

export async function createRescueAttempt(studySetId: string, examSessionId: string): Promise<RescueAttempt> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-sets/${studySetId}/rescue-attempts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ examSessionId })
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not start Rescue Mode."));
  }

  const payload = (await response.json()) as CreateRescueAttemptResponse;
  return payload.attempt;
}

export async function submitRescueRetry(studySetId: string, rescueId: string, userAnswer: string): Promise<SubmitRescueRetryResponse> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-sets/${studySetId}/rescue-attempts/${rescueId}/retry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userAnswer })
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not submit rescue retry."));
  }

  return response.json() as Promise<SubmitRescueRetryResponse>;
}

export async function saveExamSession(studySetId: string, session: ExamSession): Promise<ExamSession> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-sets/${studySetId}/exam-sessions/${session.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ session })
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not save exam session."));
  }

  const payload = (await response.json()) as SaveExamSessionResponse;
  return payload.session;
}

export async function fetchStudyJobOpsSummary(): Promise<StudyJobOpsSummaryResponse> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-jobs/ops/summary`);

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not load queue operations summary."));
  }

  return response.json() as Promise<StudyJobOpsSummaryResponse>;
}

export async function retryStudyJob(jobId: string): Promise<RetryStudyJobResponse> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-jobs/${jobId}/retry`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not retry the study job."));
  }

  return response.json() as Promise<RetryStudyJobResponse>;
}

export async function recoverStaleStudyJobs(): Promise<RecoverStudyJobsResponse> {
  const response = await authenticatedFetch(`${API_BASE_URL}/study-jobs/ops/recover-stale`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not recover stale study jobs."));
  }

  return response.json() as Promise<RecoverStudyJobsResponse>;
}

export async function fetchSystemHealth() {
  const response = await authenticatedFetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error(await parseJsonError(response, "Could not load system health."));
  }

  return response.json() as Promise<{
    ok: boolean;
    services: Record<string, string>;
    queue: { waiting: number; active: number; completed: number; failed: number; delayed: number } | null;
    worker: { updatedAt: string; queue?: string; concurrency?: number } | null;
  }>;
}

export function createExamSession(studySet: StudySet, totalQuestionsTarget = 5): ExamSession {
  const starterQuestion = buildStarterQuestion(studySet);
  const timestamp = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    studySetId: studySet.id,
    startedAt: timestamp,
    completed: false,
    currentQuestion: starterQuestion,
    turns: [],
    weakTopics: [],
    cumulativeScore: 0,
    totalQuestionsTarget
  };
}

export function applyExamTurnResult(
  session: ExamSession,
  turnResult: ExamTurnResult,
  nextQuestion: ExamQuestion | undefined,
  mergedWeakTopics: string[],
  shouldEnd: boolean
): ExamSession {
  const turns = [...session.turns, turnResult];
  const cumulativeScore = turns.reduce((total, turn) => total + turn.score, 0);

  const updated: ExamSession = {
    ...session,
    turns,
    weakTopics: mergedWeakTopics,
    cumulativeScore,
    completed: shouldEnd,
    currentQuestion: nextQuestion ?? session.currentQuestion
  };

  if (shouldEnd) {
    updated.completedAt = new Date().toISOString();
    updated.summary = buildExamSummary(updated);
  }

  return updated;
}

function buildStarterQuestion(studySet: StudySet): ExamQuestion {
  const firstFlashcard = [...studySet.flashcards].sort((left, right) => left.order - right.order)[0];
  const firstConcept = studySet.keyConcepts[0];

  return {
    id: crypto.randomUUID(),
    prompt:
      firstFlashcard?.question ??
      (firstConcept
        ? `Explain the concept of ${firstConcept} in the context of ${studySet.title}.`
        : `What is the most important idea in ${studySet.title}?`),
    focusTopic: firstConcept
  };
}

function buildExamSummary(session: ExamSession): ExamSummary {
  const averageScore =
    session.turns.length > 0 ? Math.round(session.turns.reduce((total, turn) => total + turn.score, 0) / session.turns.length) : 0;
  const topicCounts = new Map<string, number>();

  session.turns.forEach((turn) => {
    turn.weakTopics.forEach((topic) => {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    });
  });

  const sortedTopics = [...topicCounts.entries()].sort((left, right) => right[1] - left[1]).map(([topic]) => topic);
  const strongestTurn = [...session.turns].sort((left, right) => right.score - left.score)[0];

  return {
    totalQuestions: session.turns.length,
    averageScore,
    weakTopics: sortedTopics,
    strongestTopic: strongestTurn?.weakTopics[0] ? undefined : session.currentQuestion.focusTopic
  };
}

export function mergeFlashcards(existing: Flashcard[], incoming: Flashcard[]) {
  const seen = new Set(existing.map((card) => card.id));
  return [...existing, ...incoming.filter((card) => !seen.has(card.id))];
}

export function isStudyJobTerminal(job: StudySetJob) {
  return job.status === "completed" || job.status === "failed";
}
