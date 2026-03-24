import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { GenerateStudySetResponse } from "@automated-study-system/shared";

import { StudyGuideRenderer } from "../components/StudyGuideRenderer";
import { generateStudySet, saveStudySet } from "../lib/api";

const starterText = `Photosynthesis is the process by which green plants use sunlight, water, and carbon dioxide to produce glucose and oxygen. Chlorophyll in the chloroplast absorbs light energy, which powers the chemical reactions needed for this conversion.`;
const starterTitle = "Photosynthesis Basics";

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

export function CreateStudySetPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceType, setSourceType] = useState<"text" | "pdf">("text");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [result, setResult] = useState<GenerateStudySetResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const generated =
        sourceType === "pdf"
          ? await generateStudySet(
              {
                title: derivedTitle,
                sourceType: "pdf",
                sourceFileName: sourceFile?.name
              },
              sourceFile
            )
          : await generateStudySet({
              title: derivedTitle,
              sourceType: "text",
              sourceText: combinedSourceText
            });

      setTitle(derivedTitle);
      setResult(generated);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSave() {
    if (!result) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const derivedTitle = deriveTitleFromContent(title, sourceUrl, sourceText, sourceFile);
      const saved = await saveStudySet({
        sourceText:
          sourceType === "pdf"
            ? `Uploaded PDF: ${sourceFile?.name ?? "document.pdf"}`
            : [sourceUrl ? `Source URL: ${sourceUrl}` : "", sourceText].filter(Boolean).join("\n\n"),
        sourceType,
        sourceFileName: sourceFile?.name,
        ...result
      });

      navigate(`/study-sets/${saved.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the study set.");
    } finally {
      setIsSaving(false);
    }
  }

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
            <button className="content-trigger" type="button" onClick={() => setIsPasteModalOpen(true)}>
              {sourceUrl || sourceText ? "Edit pasted content" : "Paste link or text"}
            </button>
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
              </div>
            ) : null}
          </div>
        )}

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Generating..." : "Generate Study Pack"}
        </button>

        {error ? <p className="error-text">{error}</p> : null}
      </form>

      <article className="panel result-panel">
        <h2>Generated Output</h2>
        {!result ? (
          <p className="muted">
            Your generated summary, guide, and flashcards will appear here once the backend is running.
          </p>
        ) : (
          <>
            <section className="result-block">
              <h3>Summary</h3>
              <p>{result.summary}</p>
            </section>

            <section className="result-block">
              <h3>Study Guide</h3>
              <StudyGuideRenderer content={result.studyGuide} />
            </section>

            <section className="result-block">
              <h3>Key Concepts</h3>
              <div className="chip-row">
                {result.keyConcepts.map((concept) => (
                  <span className="chip" key={concept}>
                    {concept}
                  </span>
                ))}
              </div>
            </section>

            <section className="result-block">
              <h3>Flashcards</h3>
              <div className="flashcard-list">
                {result.flashcards.map((card) => (
                  <article className="flashcard" key={`${card.order}-${card.question}`}>
                    <p className="flashcard-label">Question</p>
                    <p>{card.question}</p>
                    <p className="flashcard-label">Answer</p>
                    <p>{card.answer}</p>
                  </article>
                ))}
              </div>
            </section>

            <button className="primary-button" type="button" onClick={handleSave} disabled={isSaving}>
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
