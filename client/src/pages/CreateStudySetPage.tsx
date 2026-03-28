import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { GenerateStudySetResponse, StudySetJob } from "@automated-study-system/shared";

import { StudyGuideRenderer } from "../components/StudyGuideRenderer";
import {
  createPdfStudyJob,
  createTextStudyJob,
  fetchStudyJob,
  isStudyJobTerminal,
  saveStudySet,
  subscribeToStudyJob
} from "../lib/api";

const starterText = `Photosynthesis is the process by which green plants use sunlight, water, and carbon dioxide to produce glucose and oxygen. Chlorophyll in the chloroplast absorbs light energy, which powers the chemical reactions needed for this conversion.`;
const starterTitle = "Photosynthesis Basics";
const ACTIVE_JOB_STORAGE_KEY = "study-sphere.active-study-job-id";
const JOB_STAGE_LABELS: Record<string, string> = {
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

function toUserFacingGenerationError(message: string | null | undefined) {
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

function formatPdfTitle(fileName: string) {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/^.*?(?=[A-Za-z])/, "")
    .replace(/\b(?:oceanofpdf\.com|oceanofpdf|www)\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}

function deriveTitleFromContent(title: string, sourceUrl: string, sourceText: string, sourceFile: File | null) {
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

function storeActiveJobId(jobId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!jobId) {
    window.sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
}

function readStoredActiveJobId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
}

function buildPreviewStudySet(studySet: GenerateStudySetResponse | null) {
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

const OUTPUT_PREVIEW_SECTIONS = [
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

export function CreateStudySetPage() {
  const navigate = useNavigate();
  const pasteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pdfTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const lastTextPayloadRef = useRef<{ title: string; sourceText: string } | null>(null);
  const lastPdfTitleRef = useRef<string | null>(null);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceType, setSourceType] = useState<"text" | "pdf">("text");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [result, setResult] = useState<GenerateStudySetResponse | null>(null);
  const [activeJob, setActiveJob] = useState<StudySetJob | null>(null);
  const [isSocketFallbackPolling, setIsSocketFallbackPolling] = useState(false);
  const [isRestoringJob, setIsRestoringJob] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsubscribeJobRef = useRef<() => void>(() => {});

  const clearJobSubscription = useCallback(() => {
    unsubscribeJobRef.current();
    unsubscribeJobRef.current = () => {};
  }, []);

  const clearJobState = useCallback(() => {
    storeActiveJobId(null);
    setActiveJob(null);
    setIsSocketFallbackPolling(false);
    setIsRestoringJob(false);
  }, []);

  const handleTextJobCompletion = useCallback((job: StudySetJob) => {
    storeActiveJobId(null);
    setIsSocketFallbackPolling(false);
    setIsRestoringJob(false);
    setActiveJob(job);

    if (job.generatedStudySet) {
      setResult(job.generatedStudySet);
      return;
    }

    setError("The generated study preview could not be loaded.");
  }, []);

  const handleJobFailure = useCallback((message: string | null | undefined) => {
    storeActiveJobId(null);
    setIsSocketFallbackPolling(false);
    setIsRestoringJob(false);
    setError(toUserFacingGenerationError(message ?? "The study job failed."));
  }, []);

  const subscribeToActiveJob = useCallback(
    (jobId: string) => {
      clearJobSubscription();
      unsubscribeJobRef.current = subscribeToStudyJob(
        jobId,
        (event) => {
          if (event.jobId !== jobId) {
            return;
          }

          setActiveJob(event.job);

          if (event.type === "study-job:completed") {
            clearJobSubscription();

            if (event.job.sourceType === "pdf" && event.studySetId) {
              storeActiveJobId(null);
              setIsSocketFallbackPolling(false);
              navigate(`/study-sets/${event.studySetId}`);
              return;
            }

            if (event.job.sourceType === "text") {
              handleTextJobCompletion(event.job);
            }
          }

          if (event.type === "study-job:failed") {
            clearJobSubscription();
            handleJobFailure(event.errorMessage);
          }
        },
        {
          onConnect: () => setIsSocketFallbackPolling(false),
          onDisconnect: () => setIsSocketFallbackPolling(true)
        }
      );
    },
    [clearJobSubscription, handleJobFailure, handleTextJobCompletion, navigate]
  );

  useEffect(() => {
    const storedJobId = readStoredActiveJobId();

    if (!storedJobId) {
      return;
    }

    let ignore = false;

    const hydrate = async () => {
      try {
        setIsRestoringJob(true);
        const response = await fetchStudyJob(storedJobId);

        if (ignore) {
          return;
        }

        setActiveJob(response.job);

        if (response.job.status === "completed") {
          if (response.job.sourceType === "pdf" && response.job.studySetId) {
            storeActiveJobId(null);
            navigate(`/study-sets/${response.job.studySetId}`);
            return;
          }

          if (response.job.sourceType === "text") {
            handleTextJobCompletion(response.job);
          }
          return;
        }

        setIsSocketFallbackPolling(true);
        subscribeToActiveJob(storedJobId);
      } catch (requestError) {
        if (!ignore) {
          clearJobState();
          setError(requestError instanceof Error ? requestError.message : "Could not restore the active PDF job.");
        }
      } finally {
        if (!ignore) {
          setIsRestoringJob(false);
        }
      }
    };

    void hydrate();

    return () => {
      ignore = true;
      clearJobSubscription();
    };
  }, [clearJobState, clearJobSubscription, handleTextJobCompletion, navigate, subscribeToActiveJob]);

  const resultPreview = useMemo(() => buildPreviewStudySet(result), [result]);

  function resetTextInputs() {
    setSourceUrl("");
    setSourceText("");
    setResult(null);
    setError(null);
  }

  function loadStarterExample() {
    setSourceType("text");
    setTitle(starterTitle);
    setSourceUrl("");
    setSourceText(starterText);
    setResult(null);
    setError(null);
    setIsPasteModalOpen(false);
  }

  function clearPdfSelection() {
    setSourceFile(null);
    setResult(null);
    setError(null);
  }

  function applyPdfSelection() {
    if (!sourceFile) {
      setIsPdfModalOpen(false);
      return;
    }

    const nextTitle = formatPdfTitle(sourceFile.name);
    setTitle(nextTitle);
    lastPdfTitleRef.current = nextTitle;
    setIsPdfModalOpen(false);
  }

  function openPdfPicker() {
    pdfInputRef.current?.click();
  }

  async function retryLastGeneration() {
    setError(null);
    setResult(null);
    setIsSubmitting(true);

    try {
      if (sourceType === "pdf") {
        if (!sourceFile || !lastPdfTitleRef.current) {
          throw new Error("Choose the PDF again before retrying.");
        }

        const created = await createPdfStudyJob({ title: lastPdfTitleRef.current }, sourceFile);
        setActiveJob(created.job);
        setIsSocketFallbackPolling(false);
        storeActiveJobId(created.job.id);
        subscribeToActiveJob(created.job.id);
        return;
      }

      if (!lastTextPayloadRef.current) {
        throw new Error("Add your text again before retrying.");
      }

      const created = await createTextStudyJob(lastTextPayloadRef.current);
      setActiveJob(created.job);
      setIsSocketFallbackPolling(false);
      storeActiveJobId(created.job.id);

      if (created.job.status === "completed" && created.job.generatedStudySet) {
        handleTextJobCompletion(created.job);
        return;
      }

      subscribeToActiveJob(created.job.id);
    } catch (retryError) {
      setError(toUserFacingGenerationError(retryError instanceof Error ? retryError.message : "Could not retry generation."));
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!activeJob || isStudyJobTerminal(activeJob) || !isSocketFallbackPolling) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchStudyJob(activeJob.id)
        .then((response) => {
          setActiveJob(response.job);

          if (response.job.status === "completed") {
            if (response.job.sourceType === "pdf" && response.job.studySetId) {
              storeActiveJobId(null);
              navigate(`/study-sets/${response.job.studySetId}`);
              return;
            }

            if (response.job.sourceType === "text") {
              handleTextJobCompletion(response.job);
            }
          }

          if (response.job.status === "failed") {
            storeActiveJobId(null);
            clearJobSubscription();
            handleJobFailure(response.job.errorMessage);
          }
        })
        .catch(() => undefined);
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeJob, clearJobSubscription, handleJobFailure, handleTextJobCompletion, isSocketFallbackPolling, navigate]);

  useEffect(() => clearJobSubscription, [clearJobSubscription]);

  useEffect(() => {
    if (!isPasteModalOpen && !isPdfModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      if (isPasteModalOpen) {
        pasteTextareaRef.current?.focus();
        return;
      }

      if (isPdfModalOpen) {
        pdfInputRef.current?.focus();
      }
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPasteModalOpen(false);
        setIsPdfModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      if (isPasteModalOpen) {
        pasteTriggerRef.current?.focus();
      }

      if (isPdfModalOpen) {
        pdfTriggerRef.current?.focus();
      }
    };
  }, [isPasteModalOpen, isPdfModalOpen]);

  async function handleSave() {
    if (!result) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const derivedTitle = deriveTitleFromContent(title, sourceUrl, sourceText, sourceFile);
      const combinedSourceText =
        sourceType === "text" ? [sourceUrl ? `Source URL: ${sourceUrl}` : "", sourceText].filter(Boolean).join("\n\n") : "";

      const savedStudySet = await saveStudySet({
        sourceText: combinedSourceText,
        sourceType,
        sourceFileName: sourceFile?.name,
        ...result,
        title: derivedTitle
      });

      navigate(`/study-sets/${savedStudySet.id}`);
    } catch (saveError) {
      setError(toUserFacingGenerationError(saveError instanceof Error ? saveError.message : "Could not save the study set."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const derivedTitle = deriveTitleFromContent(title, sourceUrl, sourceText, sourceFile);
      const combinedSourceText =
        sourceType === "text" ? [sourceUrl ? `Source URL: ${sourceUrl}` : "", sourceText].filter(Boolean).join("\n\n") : "";

      if (!derivedTitle) {
        throw new Error("Add a title, link, text, or PDF before generating.");
      }

      if (sourceType === "text" && !sourceText.trim() && sourceUrl.trim()) {
        throw new Error("Link-only generation is not supported yet. Paste the transcript or page text along with the link.");
      }

      if (sourceType === "text" && !combinedSourceText.trim()) {
        throw new Error("Add a link or paste text before generating.");
      }

      if (sourceType === "pdf") {
        if (!sourceFile) {
          throw new Error("Choose a PDF file before generating.");
        }

        lastPdfTitleRef.current = derivedTitle;
        const created = await createPdfStudyJob({ title: derivedTitle }, sourceFile);
        setTitle(derivedTitle);
        setActiveJob(created.job);
        setIsSocketFallbackPolling(false);
        setResult(null);
        storeActiveJobId(created.job.id);

        if (created.job.status === "completed" && created.job.studySetId) {
          storeActiveJobId(null);
          navigate(`/study-sets/${created.job.studySetId}`);
          return;
        }

        subscribeToActiveJob(created.job.id);
      } else {
        lastTextPayloadRef.current = {
          title: derivedTitle,
          sourceText: combinedSourceText
        };
        const created = await createTextStudyJob({
          title: derivedTitle,
          sourceText: combinedSourceText
        });
        setTitle(derivedTitle);
        setResult(null);
        setActiveJob(created.job);
        setIsSocketFallbackPolling(false);
        storeActiveJobId(created.job.id);

        if (created.job.status === "completed" && created.job.generatedStudySet) {
          handleTextJobCompletion(created.job);
          return;
        }

        subscribeToActiveJob(created.job.id);
      }
    } catch (submitError) {
      setError(toUserFacingGenerationError(submitError instanceof Error ? submitError.message : "Something went wrong."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const jobStageText = activeJob?.stage ? (JOB_STAGE_LABELS[activeJob.stage] ?? activeJob.stage) : "Queued";
  const jobStatusLabel = activeJob
    ? `${jobStageText}${typeof activeJob.progressPercent === "number" ? ` • ${activeJob.progressPercent}%` : ""}`
    : null;
  const canRetryGeneration =
    !isSubmitting &&
    ((sourceType === "text" && lastTextPayloadRef.current !== null) || (sourceType === "pdf" && sourceFile !== null && lastPdfTitleRef.current));
  const hasSourceUrl = sourceUrl.trim().length > 0;
  const hasSourceText = sourceText.trim().length > 0;
  const isGeneratingPreview = isSubmitting || Boolean(activeJob && !isStudyJobTerminal(activeJob));
  const previewJobSourceType = activeJob?.sourceType ?? sourceType;
  const currentStep = resultPreview ? 4 : isGeneratingPreview ? 3 : hasSourceText || hasSourceUrl || sourceFile ? 3 : 2;

  return (
    <section className="page-grid">
      <form className="panel form-panel" onSubmit={handleSubmit}>
        <div className="create-steps-row" aria-label="Create study set steps">
          {[1, 2, 3, 4].map((step) => (
            <span className={step <= currentStep ? "create-step-chip is-active" : "create-step-chip"} key={step}>
              Step {step}
            </span>
          ))}
        </div>

        <div className="field">
          <div className="field-heading">
            <span className="field-step">Step 1</span>
            <label>Choose your input</label>
            <p className="field-helper">Start from pasted notes or upload a PDF and the app will shape the rest around it.</p>
          </div>
          <div className="source-option-grid">
            <button
              className={sourceType === "text" ? "source-option-card active" : "source-option-card"}
              type="button"
              onClick={() => setSourceType("text")}
            >
              {sourceType === "text" ? <span className="source-option-check" aria-hidden="true">✓</span> : null}
              <span className="source-option-icon">Paste</span>
              <span className="source-option-title">Paste</span>
              <span className="source-option-description">YouTube transcript, website text, class notes</span>
            </button>
            <button
              className={sourceType === "pdf" ? "source-option-card active" : "source-option-card"}
              type="button"
              onClick={() => {
                setSourceType("pdf");
                setIsPdfModalOpen(true);
              }}
            >
              {sourceType === "pdf" ? <span className="source-option-check" aria-hidden="true">✓</span> : null}
              <span className="source-option-icon">PDF</span>
              <span className="source-option-title">Upload PDF</span>
              <span className="source-option-description">Lecture slides, handouts, textbook sections</span>
            </button>
          </div>
        </div>

        <div className="field">
          <div className="field-heading">
            <span className="field-step">Step 2</span>
            <label htmlFor="title">{sourceType === "pdf" ? "PDF Title" : "Study Set Title"}</label>
            <p className="field-helper">Use a clear title so the study set is easy to find later in your library.</p>
          </div>
          <input
            id="title"
            value={title}
            placeholder={starterTitle}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        {sourceType === "text" ? (
          <div className="field">
            <div className="field-heading">
              <span className="field-step">Step 2</span>
              <label htmlFor="sourceTextInline">Add content</label>
              <p className="field-helper">Paste the actual notes, transcript, or article text you want turned into a study pack.</p>
            </div>
            <div className="field">
              <label htmlFor="sourceUrl">Optional source link</label>
              <input
                id="sourceUrl"
                placeholder="https://youtube.com/watch?v=... or website URL"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
              />
            </div>
            <div className="source-chip-list">
              {hasSourceUrl ? <span className="source-chip">Link attached</span> : null}
              {hasSourceText ? <span className="source-chip">{sourceText.length} characters ready</span> : null}
              {!hasSourceUrl && !hasSourceText ? <span className="source-chip is-muted">No source added yet</span> : null}
            </div>
            <div className="field">
              <label htmlFor="sourceTextInline">Pasted notes or transcript</label>
              <textarea
                className="create-inline-textarea"
                id="sourceTextInline"
                rows={10}
                value={sourceText}
                placeholder={starterText}
                onChange={(event) => setSourceText(event.target.value)}
              />
              <div className="content-live-meta">
                <p className="muted small-copy">
                  {hasSourceText
                    ? "Text ready for generation."
                    : "Paste lecture notes, a transcript, or article text to generate a summary, flashcards, and practice."}
                </p>
                <p className="content-counter">{sourceText.length}/50000</p>
              </div>
            </div>
            <div className="inline-action-row">
              <button className="secondary-button compact-button" type="button" onClick={loadStarterExample}>
                Use Example
              </button>
              {(hasSourceUrl || hasSourceText) ? (
                <button className="secondary-button compact-button" type="button" onClick={resetTextInputs}>
                  Clear
                </button>
              ) : null}
            </div>
            {hasSourceUrl && !hasSourceText ? (
              <p className="error-text content-warning">
                A link alone is only stored as a reference. Paste the actual transcript or page text before generating.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="field">
            <div className="field-heading">
              <span className="field-step">Step 2</span>
              <label htmlFor="sourceFile">PDF Document</label>
              <p className="field-helper">Open the uploader, choose your PDF, then generate a study pack from the extracted content.</p>
            </div>
            <input
              className="pdf-file-input"
              id="sourceFile"
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0] ?? null;
                setSourceFile(selectedFile);
              }}
            />
            <div className="content-preview pdf-summary-preview">
              <p className="muted small-copy">
                {sourceFile ? `PDF title: ${formatPdfTitle(sourceFile.name)}` : "No PDF uploaded yet."}
              </p>
              <p className="muted small-copy">
                {sourceFile ? "PDF uploaded and ready for generation." : "Open the uploader to choose a PDF for this study set."}
              </p>
              {sourceFile ? (
                <div className="inline-action-row">
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() => setIsPdfModalOpen(true)}
                    ref={pdfTriggerRef}
                  >
                    Change PDF
                  </button>
                  <button className="secondary-button compact-button" type="button" onClick={clearPdfSelection}>
                    Remove PDF
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div className="field">
          <div className="field-heading">
            <span className="field-step">Step 3</span>
            <label>Generate</label>
            <p className="field-helper">Build the study pack and then review the generated summary, flashcards, and practice output.</p>
          </div>
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (sourceType === "pdf" ? "Uploading..." : "Generating...") : "Generate Study Pack"}
          </button>
        </div>

        {activeJob && !isStudyJobTerminal(activeJob) ? (
          <div className="job-status-card">
            <p className="flashcard-label">{activeJob.sourceType === "pdf" ? "PDF Processing Status" : "Study Pack Status"}</p>
            <p>{jobStatusLabel}</p>
            <p className="muted small-copy">
              {isSocketFallbackPolling
                ? "Connection dropped for a moment. We’re polling in the background and will resync automatically."
                : activeJob.cacheHit
                ? "Cache hit detected. Your result should be ready almost instantly."
                : activeJob.sourceType === "pdf"
                  ? "Your PDF is processing in the background."
                  : "Your study pack is being generated in the background."}
            </p>
            <p className="muted small-copy">You can leave this page. The app will reconnect to the job when you come back.</p>
          </div>
        ) : null}

        {error ? (
          <div className="inline-feedback-block">
            <p className="error-text">{error}</p>
            <div className="state-panel-actions">
              {canRetryGeneration ? (
                <button className="secondary-button compact-button" onClick={() => void retryLastGeneration()} type="button">
                  Retry Generation
                </button>
              ) : null}
              {activeJob ? (
                <button className="secondary-button compact-button" onClick={clearJobState} type="button">
                  Clear Status
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>

      <article className="panel result-panel">
          <div className="field-heading result-panel-heading">
            <span className="field-step">Step 4</span>
            <label>Review output</label>
            <p className="field-helper">Your study materials appear here as soon as generation starts and fill in as the job finishes.</p>
          </div>
          <h2>Generated Output</h2>
          {isRestoringJob ? (
            <div className="job-preview">
              <div className="job-preview-badge">Reconnecting</div>
              <h3>Restoring your active study job.</h3>
              <p className="job-preview-copy">We’re reconnecting to the last job you started so you can keep going without losing progress.</p>
              <div className="job-preview-progress" aria-hidden="true">
                <span className="job-preview-progress-bar" />
              </div>
              <div className="result-skeleton-grid">
                {OUTPUT_PREVIEW_SECTIONS.map((section) => (
                  <section className="result-skeleton-card" key={section.title}>
                    <p className="flashcard-label">{section.title}</p>
                    <div className="skeleton-line loading-card-title-line" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line loading-subtle-line" />
                  </section>
                ))}
              </div>
            </div>
          ) : isGeneratingPreview ? (
            <div className="job-preview">
              <div className="job-preview-badge">{previewJobSourceType === "pdf" ? "Processing PDF" : "Generating Preview"}</div>
              <h3>Your study set is being prepared.</h3>
              <p className="job-preview-copy">
                {previewJobSourceType === "pdf"
                  ? "You can stay here or leave this page. We&apos;ll reconnect to the job and open the study set as soon as it&apos;s ready."
                  : "You can stay here or leave this page. We&apos;ll reconnect to the job and bring the generated preview back when it finishes."}
              </p>
              <div className="job-preview-progress" aria-hidden="true">
                <span className="job-preview-progress-bar" />
              </div>
              <div className="result-skeleton-grid">
                {OUTPUT_PREVIEW_SECTIONS.map((section) => (
                  <section className="result-skeleton-card" key={section.title}>
                    <p className="flashcard-label">{section.title}</p>
                    <div className="skeleton-line loading-card-title-line" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line loading-subtle-line" />
                  </section>
                ))}
              </div>
            </div>
          ) : !resultPreview ? (
            <div className="result-placeholder-stack">
              {OUTPUT_PREVIEW_SECTIONS.map((section) => (
                <section className="result-placeholder-card" key={section.title}>
                  <p className="flashcard-label">{section.title}</p>
                  <h3>{section.headline}</h3>
                  <p className="result-placeholder-copy">{section.copy}</p>
                </section>
              ))}
            </div>
        ) : (
          <>
            <section className="result-block">
              <h3>Summary</h3>
              <p>{resultPreview.summary}</p>
            </section>

            <section className="result-block">
              <h3>Study Guide</h3>
              <StudyGuideRenderer content={resultPreview.studyGuide} />
            </section>

            <section className="result-block">
              <h3>Key Concepts</h3>
              <div className="chip-row">
                {resultPreview.keyConcepts.map((concept) => (
                  <span className="chip" key={concept}>
                    {concept}
                  </span>
                ))}
              </div>
            </section>

            <section className="result-block">
              <h3>Flashcards</h3>
              <div className="preview-flashcard-list">
                {resultPreview.flashcards.map((card) => (
                  <article className="preview-flashcard" key={`${card.order}-${card.question}`}>
                    <p className="preview-flashcard-label">Question</p>
                    <p className="preview-flashcard-copy">{card.question}</p>
                    <p className="preview-flashcard-label">Answer</p>
                    <p className="preview-flashcard-copy">{card.answer}</p>
                  </article>
                ))}
              </div>
            </section>

            <button className="primary-button" type="button" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Study Set"}
            </button>
          </>
        )}
      </article>

      {sourceType === "text" && isPasteModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsPasteModalOpen(false)}>
          <div
            aria-modal="true"
            className="content-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="content-modal-header">
              <div>
                <h2>Add Content</h2>
                <p className="muted">Enter a URL or paste text to create your study set.</p>
              </div>
              <button className="modal-close" type="button" onClick={() => setIsPasteModalOpen(false)}>
                Close
              </button>
            </div>

            <div className="field">
              <label htmlFor="sourceUrl">Enter a YouTube or website URL</label>
              <input
                id="sourceUrl"
                placeholder="https://youtube.com/watch?v=..."
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
              />
              <p className="muted small-copy">
                The link is saved as a reference. For accurate study generation, also paste the transcript or page text below.
              </p>
            </div>

            <div className="content-modal-divider">
              <span>or</span>
            </div>

            <div className="field">
              <label htmlFor="sourceText">Copy and paste text to add as content</label>
              <textarea
                id="sourceText"
                ref={pasteTextareaRef}
                rows={10}
                value={sourceText}
                placeholder={starterText}
                onChange={(event) => setSourceText(event.target.value)}
              />
              <p className="content-counter">{sourceText.length}/50000</p>
            </div>

            <div className="content-modal-actions">
              <button className="primary-button" type="button" onClick={() => setIsPasteModalOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sourceType === "pdf" && isPdfModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsPdfModalOpen(false)}>
          <div
            aria-modal="true"
            className="content-modal pdf-upload-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="content-modal-header">
              <div>
                <h2>Please upload your PDF</h2>
                <p className="muted">We&apos;ll turn your document into a saved study pack with guides, flashcards, and exam practice.</p>
              </div>
              <button className="modal-close" type="button" onClick={() => setIsPdfModalOpen(false)}>
                Close
              </button>
            </div>

            <button className="pdf-upload-dropzone" type="button" onClick={openPdfPicker}>
              <span className="pdf-upload-icon" aria-hidden="true">
                Upload
              </span>
              <strong>{sourceFile ? "Choose a different PDF" : "Click to upload your PDF"}</strong>
              <span>{sourceFile ? sourceFile.name : "Lecture notes, handouts, and textbook sections up to 10 MB."}</span>
            </button>

            {sourceFile ? (
              <div className="pdf-upload-status">
                <p className="flashcard-label">Ready</p>
                <p>PDF title: {formatPdfTitle(sourceFile.name)}</p>
                <p className="muted small-copy">PDF uploaded and ready for generation.</p>
              </div>
            ) : null}

            <div className="content-modal-actions">
              <button className="primary-button" type="button" onClick={applyPdfSelection} disabled={!sourceFile}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
