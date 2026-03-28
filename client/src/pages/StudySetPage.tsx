import { memo, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import type { Flashcard, RescueAttempt, StudySet } from "@automated-study-system/shared";

import { StatePanel } from "../components/StatePanel";
import { StudyGuideRenderer } from "../components/StudyGuideRenderer";
import { fetchExamSessions, fetchRescueAttempts, fetchStudySet, fetchStudySetFlashcards, mergeFlashcards } from "../lib/api";

function toStudySetLoadError(message: string | null | undefined) {
  if (!message) {
    return "We couldn't load this study set right now.";
  }

  if (/failed to fetch|network|networkerror/i.test(message)) {
    return "We couldn't reach the study-set service right now. Please try again in a moment.";
  }

  return message;
}

const FlashcardItem = memo(function FlashcardItem({ card }: { card: Flashcard }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <button
      aria-label={isFlipped ? "Hide flashcard answer" : "Reveal flashcard answer"}
      aria-pressed={isFlipped}
      className={isFlipped ? "flashcard is-flipped" : "flashcard"}
      onClick={() => setIsFlipped((current) => !current)}
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
  );
});

function MobileFlashcardTrainer({
  cards
}: {
  cards: Flashcard[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [cardFeedback, setCardFeedback] = useState<Record<string, "unfamiliar" | "familiar">>({});

  useEffect(() => {
    setIsFlipped(false);
  }, [activeIndex]);

  if (cards.length === 0) {
    return null;
  }

  const activeCard = cards[activeIndex];
  const unfamiliarCount = Object.values(cardFeedback).filter((value) => value === "unfamiliar").length;
  const familiarCount = Object.values(cardFeedback).filter((value) => value === "familiar").length;
  const unseenCount = cards.length - Object.keys(cardFeedback).length;

  function handleFeedback(nextFeedback: "unfamiliar" | "familiar") {
    setCardFeedback((current) => ({
      ...current,
      [activeCard.id]: nextFeedback
    }));

    if (activeIndex < cards.length - 1) {
      setActiveIndex((current) => current + 1);
    }
  }

  return (
    <section className="mobile-flashcard-trainer">
      <div className="mobile-flashcard-header">
        <span className="mobile-flashcard-mode">Flashcards</span>
      </div>

      <div className="mobile-flashcard-stats">
        <span className="mobile-flashcard-pill is-unfamiliar">{unfamiliarCount} Unfamiliar</span>
        <span className="mobile-flashcard-pill is-learning">{unseenCount} Unseen</span>
        <span className="mobile-flashcard-pill is-familiar">{familiarCount} Familiar</span>
      </div>

      <button
        aria-label={isFlipped ? "Hide flashcard answer" : "Reveal flashcard answer"}
        aria-pressed={isFlipped}
        className={isFlipped ? "mobile-flashcard-card is-flipped" : "mobile-flashcard-card"}
        onClick={() => setIsFlipped((current) => !current)}
        type="button"
      >
        <span className="mobile-flashcard-inner">
          <span className="mobile-flashcard-face mobile-flashcard-front">
            <span className="flashcard-label">Question</span>
            <span className="mobile-flashcard-copy">{activeCard.question}</span>
            <span className="mobile-flashcard-helper">Tap to reveal answer</span>
          </span>
          <span className="mobile-flashcard-face mobile-flashcard-back">
            <span className="flashcard-label">Answer</span>
            <span className="mobile-flashcard-copy">{activeCard.answer}</span>
            <span className="mobile-flashcard-helper">Tap to flip back</span>
          </span>
        </span>
      </button>

      <div className="mobile-flashcard-actions">
        <button className="mobile-flashcard-response is-negative" onClick={() => handleFeedback("unfamiliar")} type="button">
          Didn&apos;t know it
        </button>
        <button className="mobile-flashcard-response is-positive" onClick={() => handleFeedback("familiar")} type="button">
          I knew it
        </button>
      </div>

      <div className="mobile-flashcard-footer">
        <button
          aria-label="Previous flashcard"
          className="mobile-flashcard-nav"
          disabled={activeIndex === 0}
          onClick={() => setActiveIndex((current) => Math.max(0, current - 1))}
          type="button"
        >
          &#8249;
        </button>
        <span className="mobile-flashcard-progress">
          {activeIndex + 1} / {cards.length}
        </span>
        <button
          aria-label="Next flashcard"
          className="mobile-flashcard-nav"
          disabled={activeIndex === cards.length - 1}
          onClick={() => setActiveIndex((current) => Math.min(cards.length - 1, current + 1))}
          type="button"
        >
          &#8250;
        </button>
      </div>
    </section>
  );
}

export function StudySetPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const focusConcept = useMemo(() => {
    return typeof (location.state as { focusConcept?: string } | null)?.focusConcept === "string"
      ? (location.state as { focusConcept?: string }).focusConcept ?? null
      : null;
  }, [location.state]);
  const [studySet, setStudySet] = useState<StudySet | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [flashcardCursor, setFlashcardCursor] = useState<string | null>(null);
  const [hasMoreFlashcards, setHasMoreFlashcards] = useState(false);
  const [isLoadingMoreFlashcards, setIsLoadingMoreFlashcards] = useState(false);
  const [examSessionCount, setExamSessionCount] = useState(0);
  const [isLoadingExamSessions, setIsLoadingExamSessions] = useState(true);
  const [rescueAttempts, setRescueAttempts] = useState<RescueAttempt[]>([]);
  const [activeConcept, setActiveConcept] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);

  async function loadStudySetPage() {
    const data = await fetchStudySet(id);
    const [sessionsResult, rescuesResult] = await Promise.allSettled([fetchExamSessions(id), fetchRescueAttempts(id)]);
    const sessions = sessionsResult.status === "fulfilled" ? sessionsResult.value : [];
    const rescues = rescuesResult.status === "fulfilled" ? rescuesResult.value : [];
    const noticeParts: string[] = [];

    if (sessionsResult.status === "rejected") {
      noticeParts.push("Exam history could not be refreshed right now.");
    }

    if (rescuesResult.status === "rejected") {
      noticeParts.push("Rescue history is temporarily unavailable.");
    }

    setStudySet(data);
    setFlashcards(data.flashcards);
    setFlashcardCursor(data.flashcardCount > data.flashcards.length ? data.flashcards.at(-1)?.id ?? null : null);
    setHasMoreFlashcards(data.flashcardCount > data.flashcards.length);
    setActiveConcept(focusConcept && data.keyConcepts.includes(focusConcept) ? focusConcept : null);
    setExamSessionCount(sessions.length);
    setRescueAttempts(rescues);
    setIsLoadingExamSessions(false);
    setPageNotice(noticeParts.length > 0 ? noticeParts.join(" ") : null);
    setError(null);
  }

  useEffect(() => {
    let ignore = false;

    loadStudySetPage()
      .then(() => {
        if (!ignore) {
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!ignore) {
          setError(toStudySetLoadError(requestError instanceof Error ? requestError.message : "Could not load study set."));
          setIsLoadingExamSessions(false);
          setPageNotice(null);
        }
      });

    return () => {
      ignore = true;
    };
  }, [focusConcept, id]);

  if (error) {
    return (
      <StatePanel
        actions={
          <button
            className="primary-button"
            onClick={() => {
              setStudySet(null);
              setIsLoadingExamSessions(true);
              void loadStudySetPage().catch((requestError) => {
                setError(toStudySetLoadError(requestError instanceof Error ? requestError.message : "Could not load study set."));
                setIsLoadingExamSessions(false);
                setPageNotice(null);
              });
            }}
            type="button"
          >
            Try Again
          </button>
        }
        copy={error}
        eyebrow="Study Set Error"
        title="We couldn’t load this study set."
        tone="error"
      />
    );
  }

  if (!studySet) {
    return (
      <section className="page-grid loading-page-grid study-page">
        <article className="panel loading-panel">
          <div className="loading-stack">
            <div className="skeleton-line skeleton-short" />
            <div className="skeleton-line loading-heading-line" />
            <div className="skeleton-line loading-subtle-line" />
            <div className="loading-chip-row">
              <div className="skeleton-line loading-chip-line" />
              <div className="skeleton-line loading-chip-line" />
            </div>
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line loading-subtle-line" />
            <div className="loading-card-block">
              <div className="skeleton-line loading-card-title-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line loading-subtle-line" />
            </div>
          </div>
        </article>

        <article className="panel loading-panel">
          <div className="loading-stack">
            <div className="skeleton-line loading-heading-line" />
            <div className="loading-flashcard-grid">
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="loading-flashcard-card" key={index}>
                  <div className="skeleton-line loading-card-title-line" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line loading-subtle-line" />
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>
    );
  }

  async function handleLoadMoreFlashcards() {
    if (!flashcardCursor) {
      return;
    }

    setIsLoadingMoreFlashcards(true);

    try {
      const response = await fetchStudySetFlashcards(id, flashcardCursor);
      setFlashcards((current) => mergeFlashcards(current, response.items));
      setFlashcardCursor(response.page.nextCursor ?? null);
      setHasMoreFlashcards(response.page.hasMore);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load more flashcards.");
    } finally {
      setIsLoadingMoreFlashcards(false);
    }
  }

  const recoveredRescues = rescueAttempts.filter((attempt) => attempt.status === "recovered");
  const activeRescues = rescueAttempts.filter((attempt) => attempt.status !== "recovered");

  return (
    <section className="page-grid study-page">
      <article className="panel">
        <p className="eyebrow">Saved Study Set</p>
        <h1>{studySet.title}</h1>
        <p className="muted">
          Source: {studySet.sourceType === "pdf" ? `PDF${studySet.sourceFileName ? ` • ${studySet.sourceFileName}` : ""}` : "Text notes"}
        </p>
        <p>{studySet.summary}</p>
        {pageNotice ? (
          <div className="inline-feedback-block inline-feedback-warning">
            <p className="muted">{pageNotice}</p>
          </div>
        ) : null}
        <div className="chip-row">
          <Link
            className="primary-button"
            to={`/study-sets/${studySet.id}/exam?rescue=on`}
          >
            Take Exam With Rescue Mode
          </Link>
          <Link
            className="secondary-button"
            to={`/study-sets/${studySet.id}/exam?rescue=off`}
          >
            Take Exam Without Rescue
          </Link>
          <span className="chip">{isLoadingExamSessions ? "Loading exam history..." : `${examSessionCount} saved exam sessions`}</span>
          <span className="chip">
            {activeRescues.length > 0 ? `${activeRescues.length} active rescue step${activeRescues.length === 1 ? "" : "s"}` : `${recoveredRescues.length} rescued concept${recoveredRescues.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {rescueAttempts.length > 0 ? (
          <section className="result-block">
            <h3>Rescue History</h3>
            {recoveredRescues.length > 0 ? (
              <>
                <p className="muted small-copy">Recovered concepts</p>
                <div className="chip-row">
                  {recoveredRescues.slice(0, 6).map((attempt) => (
                    <span className="chip" key={attempt.id}>
                      {attempt.concept}
                    </span>
                  ))}
                </div>
              </>
            ) : null}

            {activeRescues.length > 0 ? (
              <div className="recent-list">
                {activeRescues.slice(0, 3).map((attempt) => (
                  <article className="recent-item" key={attempt.id}>
                    <div className="recent-item-content">
                      <strong className="recent-item-title">{attempt.concept}</strong>
                      <p className="muted">{attempt.diagnosis}</p>
                    </div>
                    <div className="recent-item-actions">
                      <Link className="recent-item-action" to={`/study-sets/${studySet.id}/exam`}>
                        Resume Rescue
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

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
        <div className="mobile-flashcard-section">
          <MobileFlashcardTrainer cards={flashcards} />
        </div>
        <div className="flashcard-list desktop-flashcard-list">
          {flashcards.map((card) => (
            <FlashcardItem card={card} key={card.id} />
          ))}
        </div>
        {hasMoreFlashcards ? (
          <button className="secondary-button" disabled={isLoadingMoreFlashcards} onClick={() => void handleLoadMoreFlashcards()} type="button">
            {isLoadingMoreFlashcards ? "Loading..." : "Load More Flashcards"}
          </button>
        ) : null}
      </article>
    </section>
  );
}
