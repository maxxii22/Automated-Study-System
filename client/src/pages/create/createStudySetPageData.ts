import type { GenerateStudySetResponse } from "@automated-study-system/shared";

export const starterText = `Photosynthesis is the process by which green plants use sunlight, water, and carbon dioxide to produce glucose and oxygen. Chlorophyll in the chloroplast absorbs light energy, which powers the chemical reactions needed for this conversion.`;
export const starterTitle = "Photosynthesis Basics";
export const ACTIVE_JOB_STORAGE_KEY = "study-sphere.active-study-job-id";

export const JOB_STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  uploaded: "Upload complete",
  "downloading-source": "Preparing document",
  "extracting-text": "Reading PDF text",
  "checking-semantic-cache": "Checking for a similar study set",
  "semantic-cache-hit": "Similar study set found",
  "generating-study-pack": "Generating flashcards and guide",
  "persisting-study-pack": "Saving your study set",
  completed: "Ready",
  failed: "Failed"
};

export const OUTPUT_PREVIEW_SECTIONS = [
  {
    title: "Summary",
    headline: "Short, structured notes from your content",
    copy: "A quick overview that pulls the main ideas into a clean, easy-to-review starting point."
  },
  {
    title: "Flashcards",
    headline: "Key concepts turned into active recall cards",
    copy: "Important ideas become question-and-answer cards you can use to test yourself fast."
  },
  {
    title: "Practice",
    headline: "Quick questions based on your notes",
    copy: "Your study set can feed straight into oral exam practice and weak-topic review."
  }
] as const;

export const CREATE_SURFACE_CARDS = [
  {
    title: "Flexible input",
    copy: "Paste notes, transcripts, or start from a PDF without changing the rhythm of the product."
  },
  {
    title: "Persistent jobs",
    copy: "Long-running work stays recoverable, so the experience still feels reliable when users leave and return."
  },
  {
    title: "Preview before save",
    copy: "Users can inspect the generated output first, making every saved pack feel deliberate."
  }
] as const;

export const PREVIEW_HIGHLIGHTS = [
  "Summary clarity",
  "Concept structure",
  "Flashcard recall",
  "Exam-ready follow-through"
] as const;

export function toUserFacingGenerationError(message: string | null | undefined) {
  const fallback = "Something went wrong while preparing your study pack. Please try again.";

  if (!message) {
    return fallback;
  }

  const normalized = message.trim();

  if (
    /resource_exhausted|quota|rate limit|429|free_tier_requests|please retry in|billing details/i.test(normalized)
  ) {
    return "Study generation is temporarily busy right now. Please retry in a few minutes.";
  }

  if (/access denied|accessdenied/i.test(normalized)) {
    return "The uploaded file could not be stored right now. Please try again in a moment.";
  }

  if (/enoent|no such file or directory/i.test(normalized)) {
    return "The uploaded file could not be read by the worker. Please retry generation.";
  }

  if (/not found for api version|generatecontent/i.test(normalized)) {
    return "The selected AI model is not available for this action right now. Please try again shortly.";
  }

  if (/failed to fetch|networkerror|network request failed/i.test(normalized)) {
    return "We couldn't reach the server right now. Please check your connection and try again.";
  }

  if (/session is invalid|sign in again|expired|401|403/i.test(normalized)) {
    return "Your session expired. Please sign in again and retry.";
  }

  if (/study generation request failed|job failed|request failed/i.test(normalized)) {
    return "Study generation could not be completed right now. Please retry in a moment.";
  }

  return normalized.length > 120 ? fallback : normalized;
}

export function formatPdfTitle(fileName: string) {
  const cleanedTitle = fileName
    .replace(/\.pdf$/i, "")
    .replace(/^.*?(?=[A-Za-z])/, "")
    .replace(/\b(?:oceanofpdf\.com|oceanofpdf|www)\b/gi, "")
    .replace(/\bcom\b/gi, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^\)]*\)/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s*\.\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanedTitle) {
    return "Uploaded PDF";
  }

  return cleanedTitle.slice(0, 72).trim();
}

export function deriveTitleFromContent(title: string, sourceUrl: string, sourceText: string, sourceFile: File | null) {
  if (title.trim()) {
    return title.trim();
  }

  if (sourceFile) {
    return formatPdfTitle(sourceFile.name);
  }

  if (sourceUrl.trim()) {
    try {
      const parsed = new URL(sourceUrl.trim());
      const lastSegment = parsed.pathname.split("/").filter(Boolean).at(-1);
      const isOpaqueVideoId = Boolean(lastSegment && /^[A-Za-z0-9_-]{8,20}$/.test(lastSegment));
      const fromPath = isOpaqueVideoId ? "" : lastSegment?.replace(/[_-]+/g, " ").trim();

      if (fromPath) {
        return fromPath;
      }

      if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
        return "YouTube Study Set";
      }

      return parsed.hostname.replace(/^www\./, "");
    } catch {
      return sourceUrl.trim().replace(/^https?:\/\//, "").slice(0, 60);
    }
  }

  if (sourceText.trim()) {
    return sourceText
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .slice(0, 6)
      .join(" ");
  }

  return "";
}

export function storeActiveJobId(jobId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!jobId) {
    window.sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
}

export function readStoredActiveJobId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
}

export function buildPreviewStudySet(studySet: GenerateStudySetResponse | null) {
  if (!studySet) {
    return null;
  }

  return {
    summary: studySet.summary,
    studyGuide: studySet.studyGuide,
    keyConcepts: studySet.keyConcepts,
    flashcards: studySet.flashcards
  };
}
