import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import type { StudySet } from "@automated-study-system/shared";

import { StudyGuideRenderer } from "../components/StudyGuideRenderer";
import { fetchStudySet, listExamSessions } from "../lib/api";

export function StudySetPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const [studySet, setStudySet] = useState<StudySet | null>(null);
  const [examSessionCount, setExamSessionCount] = useState(0);
  const [activeConcept, setActiveConcept] = useState<string | null>(null);
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    fetchStudySet(id)
      .then((data) => {
        if (!ignore) {
          setStudySet(data);
          setExamSessionCount(listExamSessions(data.id).length);
          setFlippedCards({});
          const preferredConcept =
            typeof (location.state as { focusConcept?: string } | null)?.focusConcept === "string"
              ? (location.state as { focusConcept?: string }).focusConcept
              : null;

          setActiveConcept(preferredConcept && data.keyConcepts.includes(preferredConcept) ? preferredConcept : null);
        }
      })
      .catch((requestError) => {
        if (!ignore) {
          setError(requestError instanceof Error ? requestError.message : "Could not load study set.");
        }
      });

    return () => {
      ignore = true;
    };
  }, [id, location.state]);

  if (error) {
    return <section className="panel">{error}</section>;
  }

  if (!studySet) {
    return <section className="panel">Loading study set...</section>;
  }

  const toggleFlashcard = (cardId: string) => {
    setFlippedCards((current) => ({
      ...current,
      [cardId]: !current[cardId],
    }));
  };

  return (
    <section className="page-grid study-page">
      <article className="panel">
        <p className="eyebrow">Saved Study Set</p>
        <h1>{studySet.title}</h1>
        <p className="muted">
          Source: {studySet.sourceType === "pdf" ? `PDF${studySet.sourceFileName ? ` • ${studySet.sourceFileName}` : ""}` : "Text notes"}
        </p>
        <p>{studySet.summary}</p>
        <div className="chip-row">
          <Link className="primary-button" to={`/study-sets/${studySet.id}/exam`}>
            Start Adaptive Oral Exam
          </Link>
          <span className="chip">{examSessionCount} saved exam sessions</span>
        </div>
        <section className="result-block">
          <h3>Key Concepts</h3>
          <div className="chip-row">
            {studySet.keyConcepts.map((concept) => (
              <button
                className={activeConcept === concept ? "chip concept-chip active" : "chip concept-chip"}
                key={concept}
                onClick={() => setActiveConcept((current) => (current === concept ? null : concept))}
                type="button"
              >
                {concept}
              </button>
            ))}
          </div>
          {activeConcept ? <p className="muted small-copy">Filtering study guide by: {activeConcept}</p> : null}
        </section>
        <section className="result-block">
          <h3>Study Guide</h3>
          <StudyGuideRenderer activeConcept={activeConcept} content={studySet.studyGuide} />
        </section>
      </article>

      <article className="panel">
        <h2>Flashcards</h2>
        <div className="flashcard-list">
          {studySet.flashcards.map((card) => (
            <button
              aria-label={flippedCards[card.id] ? "Hide flashcard answer" : "Reveal flashcard answer"}
              aria-pressed={Boolean(flippedCards[card.id])}
              className={flippedCards[card.id] ? "flashcard is-flipped" : "flashcard"}
              key={card.id}
              onClick={() => toggleFlashcard(card.id)}
              type="button"
            >
              <span className="flashcard-inner">
                <span className="flashcard-side flashcard-front">
                  <span className="flashcard-label">Question</span>
                  <span className="flashcard-copy">{card.question}</span>
                  <span className="flashcard-helper">Tap to reveal answer</span>
                </span>
                <span className="flashcard-side flashcard-back">
                  <span className="flashcard-label">Answer</span>
                  <span className="flashcard-copy">{card.answer}</span>
                  <span className="flashcard-helper">Tap to flip back</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}
