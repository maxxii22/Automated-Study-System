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

export function CreateStudySetPage() {
  const navigate = useNavigate();
  const pasteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
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
    setError(message ?? "The study job failed.");
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
      setError(retryError instanceof Error ? retryError.message : "Could not retry generation.");
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
    if (!isPasteModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      pasteTextareaRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPasteModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      pasteTriggerRef.current?.focus();
    };
  }, [isPasteModalOpen]);

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
      setError(saveError instanceof Error ? saveError.message : "Could not save the study set.");
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
      setError(submitError instanceof Error ? submitError.message : "Something went wrong.");
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

  return (
    <section className="page-grid">
      <form className="panel form-panel" onSubmit={handleSubmit}>
        <div className="field">
          <label>Choose your input</label>
          <div className="source-option-grid">
            <button
              className={sourceType === "text" ? "source-option-card active" : "source-option-card"}
              type="button"
              onClick={() => setSourceType("text")}
            >
              <span className="source-option-icon">Paste</span>
              <span className="source-option-title">Paste</span>
              <span className="source-option-description">YouTube transcript, website text, class notes</span>
            </button>
            <button
              className={sourceType === "pdf" ? "source-option-card active" : "source-option-card"}
              type="button"
              onClick={() => setSourceType("pdf")}
            >
              <span className="source-option-icon">PDF</span>
              <span className="source-option-title">Upload PDF</span>
              <span className="source-option-description">Lecture slides, handouts, textbook sections</span>
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="title">Study Set Title</label>
          <input
            id="title"
            value={title}
            placeholder={starterTitle}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        {sourceType === "text" ? (
          <div className="field">
            <label>Add content</label>
            <div className="inline-action-row">
              <button
                className="content-trigger"
                type="button"
                onClick={() => setIsPasteModalOpen(true)}
                ref={pasteTriggerRef}
              >
                {sourceUrl || sourceText ? "Edit pasted content" : "Paste link or text"}
              </button>
              <button className="secondary-button compact-button" type="button" onClick={loadStarterExample}>
                Use Example
              </button>
              {(sourceUrl || sourceText) ? (
                <button className="secondary-button compact-button" type="button" onClick={resetTextInputs}>
                  Clear
                </button>
              ) : null}
            </div>
            <div className="content-preview">
              <p className="muted small-copy">
                {sourceUrl ? `Link added: ${sourceUrl}` : "No link added yet."}
              </p>
              <p className="muted small-copy">
                {sourceText
                  ? `${Math.min(sourceText.length, 240)} characters of pasted text ready for generation.`
                  : "No pasted text yet. Add website text, a YouTube transcript, or your notes."}
              </p>
              {sourceUrl && !sourceText ? (
                <p className="error-text content-warning">
                  A link alone is only stored as a reference. Paste the actual transcript or page text before generating.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="sourceFile">PDF Document</label>
            <input
              className="pdf-file-input"
              id="sourceFile"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0] ?? null;
                setSourceFile(selectedFile);
              }}
            />
            <label className="content-trigger pdf-file-trigger" htmlFor="sourceFile">
              {sourceFile ? "Choose a different PDF" : "Choose PDF"}
            </label>
            <p className="muted small-copy">
              Upload lecture notes, textbook sections, or class handouts as a PDF up to 10 MB.
            </p>
            {sourceFile ? (
              <div className="content-preview">
                <p className="muted small-copy">Selected PDF:</p>
                <p className="file-pill">{sourceFile.name}</p>
                {!title.trim() ? (
                  <p className="muted small-copy">Suggested title: {formatPdfTitle(sourceFile.name)}</p>
                ) : null}
                <div className="inline-action-row">
                  <button className="secondary-button compact-button" type="button" onClick={clearPdfSelection}>
                    Remove PDF
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? (sourceType === "pdf" ? "Uploading..." : "Generating...") : "Generate Study Pack"}
        </button>

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
          <h2>Generated Output</h2>
          {isRestoringJob ? (
            <div className="job-preview">
              <div className="job-preview-badge">Reconnecting</div>
              <h3>Restoring your active study job.</h3>
              <p className="job-preview-copy">We’re reconnecting to the last job you started so you can keep going without losing progress.</p>
              <div className="job-preview-progress" aria-hidden="true">
                <span className="job-preview-progress-bar" />
              </div>
            </div>
          ) : activeJob && !isStudyJobTerminal(activeJob) ? (
            <div className="job-preview">
              <div className="job-preview-badge">{activeJob.sourceType === "pdf" ? "Processing PDF" : "Generating Preview"}</div>
              <h3>Your study set is being prepared.</h3>
              <p className="job-preview-copy">
                {activeJob.sourceType === "pdf"
                  ? "You can stay here or leave this page. We&apos;ll reconnect to the job and open the study set as soon as it&apos;s ready."
                  : "You can stay here or leave this page. We&apos;ll reconnect to the job and bring the generated preview back when it finishes."}
              </p>
              <div className="job-preview-progress" aria-hidden="true">
                <span className="job-preview-progress-bar" />
              </div>
            </div>
          ) : !resultPreview ? (
            <p className="muted">
              Your generated summary, guide, and flashcards will appear here after you generate a study pack.
            </p>
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
    </section>
  );
}
