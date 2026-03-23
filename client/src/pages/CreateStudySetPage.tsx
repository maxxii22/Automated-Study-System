import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { GenerateStudySetResponse } from "@automated-study-system/shared";

import { generateStudySet, saveStudySet } from "../lib/api";

const starterText = `Photosynthesis is the process by which green plants use sunlight, water, and carbon dioxide to produce glucose and oxygen. Chlorophyll in the chloroplast absorbs light energy, which powers the chemical reactions needed for this conversion.`;
const starterTitle = "Photosynthesis Basics";

function formatPdfTitle(fileName: string) {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function CreateStudySetPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceType, setSourceType] = useState<"text" | "pdf">("text");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [result, setResult] = useState<GenerateStudySetResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const generated =
        sourceType === "pdf"
          ? await generateStudySet(
              {
                title,
                sourceType: "pdf",
                sourceFileName: sourceFile?.name
              },
              sourceFile
            )
          : await generateStudySet({
              title,
              sourceType: "text",
              sourceText
            });

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
      const saved = await saveStudySet({
        sourceText: sourceType === "pdf" ? `Uploaded PDF: ${sourceFile?.name ?? "document.pdf"}` : sourceText,
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
          <label>Source Type</label>
          <div className="toggle-row">
            <button
              className={sourceType === "text" ? "toggle-button active" : "toggle-button"}
              type="button"
              onClick={() => setSourceType("text")}
            >
              Paste Text
            </button>
            <button
              className={sourceType === "pdf" ? "toggle-button active" : "toggle-button"}
              type="button"
              onClick={() => setSourceType("pdf")}
            >
              Upload PDF
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
            <label htmlFor="sourceText">Source Notes</label>
            <textarea
              id="sourceText"
              rows={14}
              value={sourceText}
              placeholder={starterText}
              onChange={(event) => setSourceText(event.target.value)}
            />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="sourceFile">PDF Document</label>
            <input
              id="sourceFile"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0] ?? null;
                setSourceFile(selectedFile);

                if (selectedFile && !title.trim()) {
                  setTitle(formatPdfTitle(selectedFile.name));
                }
              }}
            />
            <p className="muted small-copy">
              Upload lecture notes, textbook sections, or class handouts as a PDF up to 10 MB.
            </p>
            {sourceFile ? <p className="file-pill">Selected: {sourceFile.name}</p> : null}
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
              <pre>{result.studyGuide}</pre>
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
    </section>
  );
}
