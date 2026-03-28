import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import type { Flashcard, RescueAttempt, StudySet, StudySetListItem } from "@automated-study-system/shared";

import { StatePanel } from "../components/StatePanel";
import { StudyGuideRenderer } from "../components/StudyGuideRenderer";
import { fetchExamSessions, fetchRescueAttempts, fetchStudySet, fetchStudySetFlashcards, mergeFlashcards } from "../lib/api";
import { readCachedStudySet, writeCachedStudySet } from "../lib/studySetCache";

function toStudySetLoadError(message: string | null | undefined) {
  if (!message) {
    return "We couldn't load this study set right now.";
  }

  if (/failed to fetch|network|networkerror/i.test(message)) {
    return "We couldn't reach the study-set service right now. Please try again in a moment.";
  }

  return message;
}

const SAVED_STUDY_SETS_CACHE_KEY = "study-sphere.saved-study-sets-cache";

type StudySetPageLocationState = {
  focusConcept?: string;
  studySetPreview?: StudySetListItem;
};

function getFlashcardProgressStorageKey(studySetId: string) {
  return `study-set-flashcards:${studySetId}`;
}

function createPreviewStudySet(studySetPreview: StudySetListItem): StudySet {
  return {
    id: studySetPreview.id,
    title: studySetPreview.title,
    sourceText: "",
    sourceType: studySetPreview.sourceType,
    sourceFileName: studySetPreview.sourceFileName,
    summary: studySetPreview.summary,
    studyGuide: "",
    keyConcepts: studySetPreview.keyConcepts,
    flashcards: [],
    flashcardCount: studySetPreview.flashcardCount,
    createdAt: studySetPreview.createdAt,
    updatedAt: studySetPreview.updatedAt
  };
}

function readCachedStudySetPreview(studySetId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(SAVED_STUDY_SETS_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const parsedValue = JSON.parse(raw) as {
      items?: StudySetListItem[];
    };

    return parsedValue.items?.find((item) => item.id === studySetId) ?? null;
  } catch {
    return null;
  }
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
  studySetId,
  cards
}: {
  studySetId: string;
  cards: Flashcard[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [cardFeedback, setCardFeedback] = useState<Record<string, "unfamiliar" | "familiar">>({});
  const [streak, setStreak] = useState(0);
  const [lastOutcome, setLastOutcome] = useState<"unfamiliar" | "familiar" | null>(null);

  useEffect(() => {
    setIsFlipped(false);
  }, [activeIndex]);

  useEffect(() => {
    try {
      const savedValue = window.sessionStorage.getItem(getFlashcardProgressStorageKey(studySetId));

      if (!savedValue) {
        return;
      }

      const parsedValue = JSON.parse(savedValue) as {
        activeIndex?: number;
        cardFeedback?: Record<string, "unfamiliar" | "familiar">;
        streak?: number;
      };

      setActiveIndex(typeof parsedValue.activeIndex === "number" ? Math.min(cards.length - 1, Math.max(0, parsedValue.activeIndex)) : 0);
      setCardFeedback(parsedValue.cardFeedback ?? {});
      setStreak(typeof parsedValue.streak === "number" ? parsedValue.streak : 0);
    } catch {
      setActiveIndex(0);
      setCardFeedback({});
      setStreak(0);
    }
  }, [cards.length, studySetId]);

  useEffect(() => {
    window.sessionStorage.setItem(
      getFlashcardProgressStorageKey(studySetId),
      JSON.stringify({
        activeIndex,
        cardFeedback,
        streak
      })
    );
  }, [activeIndex, cardFeedback, streak, studySetId]);

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
    setLastOutcome(nextFeedback);
    setStreak((current) => (nextFeedback === "familiar" ? current + 1 : 0));

    if (activeIndex < cards.length - 1) {
      setActiveIndex((current) => current + 1);
    }
  }

  return (
    <section className="mobile-flashcard-trainer">
      <div className="mobile-flashcard-topline">
        <span className="mobile-flashcard-resume">Continue where you left off</span>
        <span className="mobile-flashcard-streak">Streak {streak}</span>
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

      {lastOutcome ? (
        <div className={lastOutcome === "familiar" ? "mobile-flashcard-feedback is-positive" : "mobile-flashcard-feedback is-negative"}>
          <strong>{lastOutcome === "familiar" ? "Locked in" : "Needs another pass"}</strong>
          <span>{lastOutcome === "familiar" ? "Keep the streak going with the next card." : "This card is now marked for review."}</span>
        </div>
      ) : null}

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
  const locationState = (location.state as StudySetPageLocationState | null) ?? null;
  const conceptsSectionRef = useRef<HTMLElement | null>(null);
  const guideSectionRef = useRef<HTMLElement | null>(null);
  const flashcardsSectionRef = useRef<HTMLElement | null>(null);
  const focusConcept = useMemo(() => {
    return typeof locationState?.focusConcept === "string"
      ? locationState.focusConcept ?? null
      : null;
  }, [locationState]);
  const previewStudySet = useMemo(() => {
    const nextPreview = locationState?.studySetPreview ?? readCachedStudySetPreview(id);
    return nextPreview ? createPreviewStudySet(nextPreview) : null;
  }, [id, locationState]);
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
    const [studySetResult, sessionsResult, rescuesResult] = await Promise.allSettled([
      fetchStudySet(id),
      fetchExamSessions(id),
      fetchRescueAttempts(id)
    ]);

    if (studySetResult.status !== "fulfilled") {
      throw studySetResult.reason;
    }

    const data = studySetResult.value;
    const sessions = sessionsResult.status === "fulfilled" ? sessionsResult.value : [];
    const rescues = rescuesResult.status === "fulfilled" ? rescuesResult.value : [];
    const noticeParts: string[] = [];

    if (sessionsResult.status === "rejected") {
      noticeParts.push("Exam history could not be refreshed right now.");
    }

    if (rescuesResult.status === "rejected") {
      noticeParts.push("Rescue history is temporarily unavailable.");
    }

    writeCachedStudySet(data);
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
    const cachedStudySet = readCachedStudySet(id);

    if (cachedStudySet) {
      setStudySet(cachedStudySet);
      setFlashcards(cachedStudySet.flashcards);
      setFlashcardCursor(cachedStudySet.flashcardCount > cachedStudySet.flashcards.length ? cachedStudySet.flashcards.at(-1)?.id ?? null : null);
      setHasMoreFlashcards(cachedStudySet.flashcardCount > cachedStudySet.flashcards.length);
      setActiveConcept(focusConcept && cachedStudySet.keyConcepts.includes(focusConcept) ? focusConcept : null);
      setError(null);
    } else if (previewStudySet) {
      setStudySet(previewStudySet);
      setFlashcards([]);
      setFlashcardCursor(null);
      setHasMoreFlashcards(false);
      setActiveConcept(focusConcept && previewStudySet.keyConcepts.includes(focusConcept) ? focusConcept : null);
      setError(null);
      setPageNotice("Loading full study-set details. You can still review the summary and concepts while the rest catches up.");
    }

    loadStudySetPage()
      .then(() => {
        if (!ignore) {
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!ignore) {
          if (cachedStudySet || previewStudySet) {
            setIsLoadingExamSessions(false);
            setPageNotice("Live study-set details are temporarily unavailable. Showing the latest available preview instead.");
            setError(null);
            return;
          }

          setError(toStudySetLoadError(requestError instanceof Error ? requestError.message : "Could not load study set."));
          setIsLoadingExamSessions(false);
          setPageNotice(null);
        }
      });

    return () => {
      ignore = true;
    };
  }, [focusConcept, id]);

  if (error && !studySet) {
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
  const coreConcepts = studySet.keyConcepts.slice(0, 3);
  const supportingConcepts = studySet.keyConcepts.slice(3);
  const isPreviewOnly = !studySet.studyGuide && studySet.flashcards.length === 0 && !studySet.sourceText;

  function scrollToSection(section: "concepts" | "guide" | "flashcards") {
    const target =
      section === "concepts"
        ? conceptsSectionRef.current
        : section === "guide"
          ? guideSectionRef.current
          : flashcardsSectionRef.current;

    target?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  return (
    <section className="page-grid study-page">
      <article className="panel">
        <p className="eyebrow">Saved Study Set</p>
        <h1>{studySet.title}</h1>
        <p className="muted">
          Source: {studySet.sourceType === "pdf" ? `PDF${studySet.sourceFileName ? ` • ${studySet.sourceFileName}` : ""}` : "Text notes"}
        </p>
        <p className="study-page-summary">{studySet.summary}</p>
        {pageNotice ? (
          <div className="inline-feedback-block inline-feedback-warning">
            <p className="muted">{pageNotice}</p>
          </div>
        ) : null}
        <div className="study-page-actions">
          <Link
            aria-disabled={isPreviewOnly}
            className={isPreviewOnly ? "primary-button disabled-link-button" : "primary-button"}
            onClick={(event) => {
              if (isPreviewOnly) {
                event.preventDefault();
              }
            }}
            to={`/study-sets/${studySet.id}/exam?rescue=on`}
          >
            Take Exam With Rescue Mode
          </Link>
          <Link
            aria-disabled={isPreviewOnly}
            className={isPreviewOnly ? "secondary-button disabled-link-button" : "secondary-button"}
            onClick={(event) => {
              if (isPreviewOnly) {
                event.preventDefault();
              }
            }}
            to={`/study-sets/${studySet.id}/exam?rescue=off`}
          >
            Take Exam Without Rescue
          </Link>
          <Link className="secondary-button" to="/saved">
            Back to Library
          </Link>
        </div>
        <div className="chip-row">
          <span className="chip">{isPreviewOnly ? "Waiting for full study set..." : isLoadingExamSessions ? "Loading exam history..." : `${examSessionCount} saved exam sessions`}</span>
          <span className="chip">
            {activeRescues.length > 0 ? `${activeRescues.length} active rescue step${activeRescues.length === 1 ? "" : "s"}` : `${recoveredRescues.length} rescued concept${recoveredRescues.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <nav className="study-section-nav" aria-label="Study set sections">
          <button className="study-section-nav-item" onClick={() => scrollToSection("concepts")} type="button">
            Concepts
          </button>
          <button className="study-section-nav-item" onClick={() => scrollToSection("guide")} type="button">
            Guide
          </button>
          <button className="study-section-nav-item" onClick={() => scrollToSection("flashcards")} type="button">
            Flashcards
          </button>
        </nav>

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

        <section className="result-block study-section-card" ref={conceptsSectionRef}>
          <h3>Key Concepts</h3>
          <div className="concept-group-stack">
            <div className="concept-group-card">
              <div className="concept-group-header">
                <span className="concept-group-kicker">Core Concepts</span>
                <p className="muted small-copy">Start here for the highest-yield ideas.</p>
              </div>
              <div className="chip-row">
                {coreConcepts.map((concept) => (
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
            </div>

            {supportingConcepts.length > 0 ? (
              <div className="concept-group-card concept-group-card-soft">
                <div className="concept-group-header">
                  <span className="concept-group-kicker">Supporting Concepts</span>
                  <p className="muted small-copy">Use these to tighten the edges after the core ideas click.</p>
                </div>
                <div className="chip-row">
                  {supportingConcepts.map((concept) => (
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
              </div>
            ) : null}
          </div>
          {activeConcept ? <p className="muted small-copy">Filtering study guide by: {activeConcept}</p> : null}
        </section>
        <section className="result-block study-section-card" ref={guideSectionRef}>
          <h3>Study Guide</h3>
          <p className="muted small-copy">Open only the sections you want to focus on and use the concept filter to narrow the guide.</p>
          {studySet.studyGuide ? (
            <StudyGuideRenderer activeConcept={activeConcept} content={studySet.studyGuide} />
          ) : (
            <div className="study-guide-preview-empty">
              <p className="muted">The full study guide is still loading from the live service.</p>
            </div>
          )}
        </section>
      </article>

      <article className="panel" ref={flashcardsSectionRef}>
        <h2>Flashcards</h2>
        <p className="muted small-copy">Use the mobile trainer for fast recall reps and build momentum one card at a time.</p>
        {flashcards.length > 0 ? (
          <>
            <div className="mobile-flashcard-section">
              <MobileFlashcardTrainer cards={flashcards} studySetId={studySet.id} />
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
          </>
        ) : (
          <div className="study-guide-preview-empty">
            <p className="muted">Flashcards will appear here once the live study-set details finish loading.</p>
          </div>
        )}
      </article>
    </section>
  );
}
