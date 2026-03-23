import type {
  GenerateStudySetRequest,
  GenerateStudySetResponse,
  StudySet
} from "@automated-study-system/shared";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? "/api" : "http://localhost:4000/api");

export async function fetchStudySets(): Promise<StudySet[]> {
  const response = await fetch(`${API_BASE_URL}/study-sets`);

  if (!response.ok) {
    throw new Error("Failed to load study sets.");
  }

  return response.json() as Promise<StudySet[]>;
}

export async function fetchStudySet(id: string): Promise<StudySet> {
  const response = await fetch(`${API_BASE_URL}/study-sets/${id}`);

  if (!response.ok) {
    throw new Error("Failed to load study set.");
  }

  return response.json() as Promise<StudySet>;
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
  const response = await fetch(`${API_BASE_URL}/study-sets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? "Failed to save study set.");
  }

  return response.json() as Promise<StudySet>;
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
