import type {
  EvaluateExamTurnRequest,
  EvaluateExamTurnResponse,
  ExamQuestion,
  ExamSession,
  ExamSummary,
  ExamTurnResult,
  GenerateStudySetRequest,
  GenerateStudySetResponse,
  StudySet
} from "@automated-study-system/shared";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? "/api" : "http://localhost:4000/api");
const STUDY_SET_STORAGE_KEY = "study-sphere.study-sets";
const EXAM_SESSION_STORAGE_KEY = "study-sphere.exam-sessions";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStoredStudySets(): StudySet[] {
  if (!canUseStorage()) {
    return [];
  }

  const raw = window.localStorage.getItem(STUDY_SET_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as StudySet[];
  } catch {
    return [];
  }
}

function writeStoredStudySets(studySets: StudySet[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STUDY_SET_STORAGE_KEY, JSON.stringify(studySets));
}

function readStoredExamSessions(): ExamSession[] {
  if (!canUseStorage()) {
    return [];
  }

  const raw = window.localStorage.getItem(EXAM_SESSION_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as ExamSession[];
  } catch {
    return [];
  }
}

function writeStoredExamSessions(sessions: ExamSession[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(EXAM_SESSION_STORAGE_KEY, JSON.stringify(sessions));
}

export async function fetchStudySets(): Promise<StudySet[]> {
  return readStoredStudySets().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function fetchStudySet(id: string): Promise<StudySet> {
  const studySet = readStoredStudySets().find((item) => item.id === id);

  if (!studySet) {
    throw new Error("Study set not found on this device.");
  }

  return studySet;
}

export async function generateStudySet(
  payload: GenerateStudySetRequest,
  sourceFile?: File | null
): Promise<GenerateStudySetResponse> {
  const response =
    payload.sourceType === "pdf"
      ? await sendPdfGenerationRequest(payload, sourceFile)
      : await fetch(`${API_BASE_URL}/study-sets/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? "Failed to generate study set.");
  }

  return response.json() as Promise<GenerateStudySetResponse>;
}

export async function saveStudySet(
  payload: GenerateStudySetRequest & GenerateStudySetResponse
): Promise<StudySet> {
  const studySets = readStoredStudySets();
  const timestamp = new Date().toISOString();

  const studySet: StudySet = {
    id: crypto.randomUUID(),
    title: payload.title,
    sourceText: payload.sourceText ?? "",
    sourceType: payload.sourceType,
    sourceFileName: payload.sourceFileName,
    summary: payload.summary,
    studyGuide: payload.studyGuide,
    keyConcepts: payload.keyConcepts,
    flashcards: payload.flashcards.map((card, index) => ({
      id: crypto.randomUUID(),
      question: card.question,
      answer: card.answer,
      order: card.order ?? index + 1
    })),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  writeStoredStudySets([studySet, ...studySets]);
  return studySet;
}

export async function deleteStudySet(id: string): Promise<void> {
  const studySets = readStoredStudySets();
  writeStoredStudySets(studySets.filter((studySet) => studySet.id !== id));

  const sessions = readStoredExamSessions();
  writeStoredExamSessions(sessions.filter((session) => session.studySetId !== id));
}

export async function evaluateExamTurn(
  payload: EvaluateExamTurnRequest
): Promise<EvaluateExamTurnResponse> {
  const response = await fetch(`${API_BASE_URL}/study-sets/exam-turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? "Failed to evaluate exam answer.");
  }

  return response.json() as Promise<EvaluateExamTurnResponse>;
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

export function getExamSession(studySetId: string): ExamSession | null {
  return readStoredExamSessions().find((session) => session.studySetId === studySetId && !session.completed) ?? null;
}

export function listExamSessions(studySetId: string): ExamSession[] {
  return readStoredExamSessions()
    .filter((session) => session.studySetId === studySetId)
    .sort((left, right) => (right.completedAt ?? right.startedAt).localeCompare(left.completedAt ?? left.startedAt));
}

export function saveExamSession(session: ExamSession): ExamSession {
  const sessions = readStoredExamSessions();
  const nextSessions = [session, ...sessions.filter((item) => item.id !== session.id)];
  writeStoredExamSessions(nextSessions);
  return session;
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

async function sendPdfGenerationRequest(
  payload: GenerateStudySetRequest,
  sourceFile?: File | null
): Promise<Response> {
  if (payload.sourceType !== "pdf") {
    throw new Error("PDF generation requires a PDF source.");
  }

  if (!sourceFile) {
    throw new Error("Choose a PDF file before generating.");
  }

  const formData = new FormData();
  formData.append("title", payload.title);
  formData.append("sourceFile", sourceFile);

  return fetch(`${API_BASE_URL}/study-sets/generate`, {
    method: "POST",
    body: formData
  });
}
