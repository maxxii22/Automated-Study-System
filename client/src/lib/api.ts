import type {
  GenerateStudySetRequest,
  GenerateStudySetResponse,
  StudySet
} from "@automated-study-system/shared";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? "/api" : "http://localhost:4000/api");
const STUDY_SET_STORAGE_KEY = "study-sphere.study-sets";

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
