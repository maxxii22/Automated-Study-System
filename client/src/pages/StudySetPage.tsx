import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { StudySet } from "@automated-study-system/shared";

import { fetchStudySet, listExamSessions } from "../lib/api";

export function StudySetPage() {
  const { id = "" } = useParams();
  const [studySet, setStudySet] = useState<StudySet | null>(null);
  const [examSessionCount, setExamSessionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    fetchStudySet(id)
      .then((data) => {
        if (!ignore) {
          setStudySet(data);
          setExamSessionCount(listExamSessions(data.id).length);
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
  }, [id]);

  if (error) {
    return <section className="panel">{error}</section>;
  }

  if (!studySet) {
    return <section className="panel">Loading study set...</section>;
  }

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
              <span className="chip" key={concept}>
                {concept}
              </span>
            ))}
          </div>
        </section>
        <section className="result-block">
          <h3>Study Guide</h3>
          <pre>{studySet.studyGuide}</pre>
        </section>
      </article>

      <article className="panel">
        <h2>Flashcards</h2>
        <div className="flashcard-list">
          {studySet.flashcards.map((card) => (
            <article className="flashcard" key={card.id}>
              <p className="flashcard-label">Question</p>
              <p>{card.question}</p>
              <p className="flashcard-label">Answer</p>
              <p>{card.answer}</p>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}
