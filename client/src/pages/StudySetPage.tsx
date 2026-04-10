import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import type { Flashcard, RescueAttempt, StudySet, StudySetListItem } from "@automated-study-system/shared";
import {
  ArrowRight,
  BookOpenText,
  BrainCircuit,
  GraduationCap,
  Layers3,
  LibraryBig,
  Orbit,
  Sparkles
} from "lucide-react";

import { Reveal } from "@/components/Reveal";
import { StatePanel } from "@/components/StatePanel";
import { StudyGuideRenderer } from "@/components/StudyGuideRenderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  fetchExamSessionCount,
  fetchRescueAttempts,
  fetchStudySet,
  fetchStudySetFlashcards,
  mergeFlashcards
} from "../lib/api";
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
const STUDY_SET_RETRY_DELAYS_MS = [350, 900];

type StudySetPageLocationState = {
  focusConcept?: string;
  studySet?: StudySet;
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

const conceptButtonClass =
  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition duration-200";

const FlashcardItem = memo(function FlashcardItem({ card, index }: { card: Flashcard; index: number }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <button
      aria-label={isFlipped ? "Hide flashcard answer" : "Reveal flashcard answer"}
      aria-pressed={isFlipped}
      className="group w-full text-left [perspective:1600px]"
      onClick={() => setIsFlipped((current) => !current)}
      type="button"
    >
      <span
        className={cn(
          "relative block min-h-[18rem] transition-transform duration-500 [transform-style:preserve-3d]",
          isFlipped && "[transform:rotateY(180deg)]"
        )}
      >
        <span className="absolute inset-0 grid gap-4 overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(13,18,29,0.98),rgba(8,11,18,0.98))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.24)] [backface-visibility:hidden]">
          <span className="flex items-center justify-between gap-3">
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Recall Prompt
            </span>
            <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[0.72rem] text-zinc-400">
              Card {index + 1}
            </span>
          </span>
          <span className="font-[family-name:var(--font-display)] text-2xl leading-tight text-white">{card.question}</span>
          <span className="mt-auto flex items-center justify-between gap-3 text-sm text-zinc-400">
            <span>Say the answer out loud before flipping.</span>
            <span className="text-zinc-500 transition duration-200 group-hover:text-zinc-300">Tap to reveal</span>
          </span>
        </span>

        <span className="absolute inset-0 grid gap-4 overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(31,23,42,0.98),rgba(12,12,22,0.98))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.24)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <span className="flex items-center justify-between gap-3">
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Answer
            </span>
            <span className="rounded-full border border-amber-300/12 bg-amber-300/8 px-3 py-1 text-[0.72rem] text-amber-100/80">
              Memory check
            </span>
          </span>
          <span className="text-sm leading-8 text-zinc-200">{card.answer}</span>
          <span className="mt-auto flex items-center justify-between gap-3 text-sm text-zinc-400">
            <span>Use this to tighten the wording you’ll use in the exam.</span>
            <span className="text-zinc-500 transition duration-200 group-hover:text-zinc-300">Tap to flip back</span>
          </span>
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
    <Card className="min-w-0 overflow-hidden rounded-[1.7rem] border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.018))] shadow-none">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Mobile trainer</p>
            <h3 className="font-[family-name:var(--font-display)] text-[1.85rem] text-white">Fast recall loop</h3>
          </div>
          <Badge className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[0.72rem] text-zinc-100">
            Streak {streak}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-[0.72rem] text-rose-100">
            {unfamiliarCount} unfamiliar
          </Badge>
          <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.72rem] text-zinc-300">
            {unseenCount} unseen
          </Badge>
          <Badge className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[0.72rem] text-emerald-100">
            {familiarCount} familiar
          </Badge>
        </div>

        <button
          aria-label={isFlipped ? "Hide flashcard answer" : "Reveal flashcard answer"}
          aria-pressed={isFlipped}
          className="group block w-full text-left [perspective:1600px]"
          onClick={() => setIsFlipped((current) => !current)}
          type="button"
        >
          <span
            className={cn(
              "relative block min-h-[25rem] transition-transform duration-500 [transform-style:preserve-3d]",
              isFlipped && "[transform:rotateY(180deg)]"
            )}
          >
            <span className="absolute inset-0 grid gap-4 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(11,16,27,0.98),rgba(8,11,18,0.98))] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.2)] [backface-visibility:hidden]">
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Active card
                </span>
                <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[0.72rem] text-zinc-400">
                  {activeIndex + 1} / {cards.length}
                </span>
              </span>

              <span className="space-y-3">
                <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Question</span>
                <span className="block break-words [overflow-wrap:anywhere] font-[family-name:var(--font-display)] text-[1.8rem] leading-tight text-white">
                  {activeCard.question}
                </span>
              </span>

              <span className="mt-auto flex items-center justify-between gap-3 text-sm text-zinc-400">
                <span>Think it through first, then flip the card.</span>
                <span className="text-zinc-500 transition duration-200 group-hover:text-zinc-300">Tap to flip</span>
              </span>
            </span>

            <span className="absolute inset-0 grid gap-4 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(31,23,42,0.98),rgba(12,12,22,0.98))] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.2)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Answer
                </span>
                <span className="rounded-full border border-amber-300/12 bg-amber-300/8 px-3 py-1 text-[0.72rem] text-amber-100/80">
                  Memory check
                </span>
              </span>

              <span className="break-words [overflow-wrap:anywhere] text-sm leading-7 text-zinc-100">{activeCard.answer}</span>

              <span className="mt-auto flex items-center justify-between gap-3 text-sm text-zinc-400">
                <span>Use this wording to sharpen your exam response.</span>
                <span className="text-zinc-500 transition duration-200 group-hover:text-zinc-300">Tap to flip back</span>
              </span>
            </span>
          </span>
        </button>

        {lastOutcome ? (
          <div
            aria-live="polite"
            className={cn(
              "rounded-[1.3rem] border px-4 py-3 text-sm leading-7",
              lastOutcome === "familiar"
                ? "border-emerald-400/18 bg-emerald-400/10 text-emerald-100"
                : "border-amber-300/16 bg-amber-300/10 text-amber-50"
            )}
            role="status"
          >
            <strong className="block font-medium">
              {lastOutcome === "familiar" ? "Locked in." : "Marked for another pass."}
            </strong>
            <span className="text-current/85">
              {lastOutcome === "familiar"
                ? "Keep momentum going with the next card."
                : "This idea now has a clear signal for review."}
            </span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-amber-300/16 bg-amber-300/8 px-4 text-sm font-semibold text-amber-50 transition hover:bg-amber-300/12"
            onClick={() => handleFeedback("unfamiliar")}
            type="button"
          >
            Didn&apos;t know it
          </button>
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-emerald-400/18 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/14"
            onClick={() => handleFeedback("familiar")}
            type="button"
          >
            I knew it
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-center text-sm text-zinc-400">Continue where you left off</p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              className="h-10 rounded-full border border-white/10 bg-white/[0.04] px-4 text-zinc-100 hover:bg-white/[0.08]"
              disabled={activeIndex === 0}
              onClick={() => setActiveIndex((current) => Math.max(0, current - 1))}
              type="button"
              variant="ghost"
            >
              Previous
            </Button>
            <Button
              className="h-10 rounded-full border border-white/10 bg-white/[0.04] px-4 text-zinc-100 hover:bg-white/[0.08]"
              disabled={activeIndex === cards.length - 1}
              onClick={() => setActiveIndex((current) => Math.min(cards.length - 1, current + 1))}
              type="button"
              variant="ghost"
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const MobileFlashcardListItem = memo(function MobileFlashcardListItem({
  card,
  index
}: {
  card: Flashcard;
  index: number;
}) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <button
      aria-label={isFlipped ? "Hide flashcard answer" : "Reveal flashcard answer"}
      aria-pressed={isFlipped}
      className="group block w-full text-left [perspective:1600px]"
      onClick={() => setIsFlipped((current) => !current)}
      type="button"
    >
      <span
        className={cn(
          "relative block min-h-[13.5rem] transition-transform duration-500 [transform-style:preserve-3d]",
          isFlipped && "[transform:rotateY(180deg)]"
        )}
      >
        <span className="absolute inset-0 grid gap-3 overflow-hidden rounded-[1.3rem] border border-white/8 bg-white/[0.03] p-4 shadow-none [backface-visibility:hidden]">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Card {index + 1}</span>
          <span className="break-words [overflow-wrap:anywhere] text-base font-semibold leading-7 text-white">{card.question}</span>
          <span className="mt-auto text-sm text-zinc-500 transition duration-200 group-hover:text-zinc-300">Tap to flip</span>
        </span>

        <span className="absolute inset-0 grid gap-3 overflow-hidden rounded-[1.3rem] border border-amber-300/14 bg-[linear-gradient(180deg,rgba(255,184,108,0.08),rgba(255,184,108,0.02))] p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-amber-100/80">Answer</span>
          <span className="break-words [overflow-wrap:anywhere] text-sm leading-7 text-zinc-100">{card.answer}</span>
          <span className="mt-auto text-sm text-amber-100/70 transition duration-200 group-hover:text-amber-50">Tap to flip back</span>
        </span>
      </span>
    </button>
  );
});

function LoadingSurface() {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
      <Card className="rounded-[2rem] border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <Skeleton className="h-6 w-28 bg-white/8" />
          <Skeleton className="h-14 w-3/4 bg-white/8" />
          <Skeleton className="h-5 w-1/2 bg-white/8" />
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton className="h-36 rounded-[1.5rem] bg-white/8" key={index} />
            ))}
          </div>
          <Skeleton className="h-12 w-full rounded-full bg-white/8" />
          <Skeleton className="h-48 rounded-[1.6rem] bg-white/8" />
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <CardContent className="space-y-5 p-6">
          <Skeleton className="h-6 w-24 bg-white/8" />
          <Skeleton className="h-10 w-1/2 bg-white/8" />
          <Skeleton className="h-72 rounded-[1.6rem] bg-white/8" />
          <Skeleton className="h-44 rounded-[1.6rem] bg-white/8" />
        </CardContent>
      </Card>
    </section>
  );
}

export function StudySetPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const locationState = (location.state as StudySetPageLocationState | null) ?? null;
  const conceptsSectionRef = useRef<HTMLDivElement | null>(null);
  const guideSectionRef = useRef<HTMLDivElement | null>(null);
  const flashcardsSectionRef = useRef<HTMLDivElement | null>(null);
  const focusConcept = useMemo(() => {
    return typeof locationState?.focusConcept === "string"
      ? locationState.focusConcept ?? null
      : null;
  }, [locationState]);
  const preloadedStudySet = useMemo(() => {
    return locationState?.studySet?.id === id ? locationState.studySet : null;
  }, [id, locationState]);
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
  const [isMobileDeckExpanded, setIsMobileDeckExpanded] = useState(false);

  function commitStudySet(data: StudySet, flashcardCursorOverride?: string | null, hasMoreFlashcardsOverride?: boolean) {
    writeCachedStudySet(data);
    setStudySet(data);
    setFlashcards(data.flashcards);
    setFlashcardCursor(
      flashcardCursorOverride ?? (data.flashcardCount > data.flashcards.length ? data.flashcards.at(-1)?.id ?? null : null)
    );
    setHasMoreFlashcards(hasMoreFlashcardsOverride ?? data.flashcardCount > data.flashcards.length);
    setActiveConcept(focusConcept && data.keyConcepts.includes(focusConcept) ? focusConcept : null);
    setError(null);
  }

  async function hydrateFlashcards(data: StudySet) {
    if (data.flashcards.length > 0 || data.flashcardCount === 0) {
      return {
        flashcardCursor: data.flashcardCount > data.flashcards.length ? data.flashcards.at(-1)?.id ?? null : null,
        hasMoreFlashcards: data.flashcardCount > data.flashcards.length,
        studySet: data
      };
    }

    const response = await fetchStudySetFlashcards(id);

    return {
      flashcardCursor: response.page.nextCursor ?? null,
      hasMoreFlashcards: response.page.hasMore,
      studySet: {
        ...data,
        flashcards: response.items
      }
    };
  }

  async function loadStudySetPage() {
    setIsLoadingExamSessions(true);
    const [studySetResult, examCountResult, rescuesResult] = await Promise.allSettled([
      fetchStudySet(id),
      fetchExamSessionCount(id),
      fetchRescueAttempts(id)
    ]);

    if (studySetResult.status === "rejected") {
      throw studySetResult.reason;
    }

    const data = studySetResult.value;
    const hydratedData = await hydrateFlashcards(data);

    commitStudySet(hydratedData.studySet, hydratedData.flashcardCursor, hydratedData.hasMoreFlashcards);

    const rescues = rescuesResult.status === "fulfilled" ? rescuesResult.value : [];
    const noticeParts: string[] = [];

    if (examCountResult.status === "rejected") {
      noticeParts.push("Exam history could not be refreshed right now.");
    }

    if (rescuesResult.status === "rejected") {
      noticeParts.push("Rescue history is temporarily unavailable.");
    }

    setExamSessionCount(examCountResult.status === "fulfilled" ? examCountResult.value : 0);
    setRescueAttempts(rescues);
    setIsLoadingExamSessions(false);
    setPageNotice(noticeParts.length > 0 ? noticeParts.join(" ") : null);
  }

  useEffect(() => {
    let ignore = false;
    const cachedStudySet = preloadedStudySet ?? readCachedStudySet(id);
    const hasIncompleteFallback =
      ((cachedStudySet?.flashcardCount ?? 0) > 0 && (cachedStudySet?.flashcards.length ?? 0) === 0) || Boolean(previewStudySet);

    async function waitForRetry(delayMs: number) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, delayMs);
      });
    }

    setExamSessionCount(0);
    setRescueAttempts([]);
    setIsLoadingExamSessions(true);

    if (cachedStudySet) {
      if (preloadedStudySet) {
        writeCachedStudySet(preloadedStudySet);
      }
      setStudySet(cachedStudySet);
      setFlashcards(cachedStudySet.flashcards);
      setFlashcardCursor(cachedStudySet.flashcardCount > cachedStudySet.flashcards.length ? cachedStudySet.flashcards.at(-1)?.id ?? null : null);
      setHasMoreFlashcards(cachedStudySet.flashcardCount > cachedStudySet.flashcards.length);
      setActiveConcept(focusConcept && cachedStudySet.keyConcepts.includes(focusConcept) ? focusConcept : null);
      setError(null);
      setPageNotice(null);
    } else if (previewStudySet) {
      setStudySet(previewStudySet);
      setFlashcards([]);
      setFlashcardCursor(null);
      setHasMoreFlashcards(false);
      setActiveConcept(focusConcept && previewStudySet.keyConcepts.includes(focusConcept) ? focusConcept : null);
      setError(null);
      setPageNotice("Loading full study-set details. You can still review the summary and concepts while the rest catches up.");
    }

    (async () => {
      let lastError: unknown = null;
      const retryDelays = hasIncompleteFallback ? STUDY_SET_RETRY_DELAYS_MS : [];

      for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
        try {
          await loadStudySetPage();

          if (!ignore) {
            setError(null);
          }

          return;
        } catch (requestError) {
          lastError = requestError;

          if (ignore) {
            return;
          }

          if (attempt < retryDelays.length) {
            setPageNotice("Still reconnecting the full study set. Flashcards and exam history are retrying automatically.");
            await waitForRetry(retryDelays[attempt]);
          }
        }
      }

      if (!ignore) {
        if (cachedStudySet || previewStudySet) {
          setIsLoadingExamSessions(false);
          setPageNotice("Live study-set details are temporarily unavailable. Showing the latest available preview instead.");
          setError(null);
          return;
        }

        setError(toStudySetLoadError(lastError instanceof Error ? lastError.message : "Could not load study set."));
        setIsLoadingExamSessions(false);
        setPageNotice(null);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [focusConcept, id, preloadedStudySet, previewStudySet]);

  useEffect(() => {
    setIsMobileDeckExpanded(false);
  }, [id, flashcards.length]);

  if (error && !studySet) {
    return (
      <StatePanel
        actions={
          <Button
            className="h-11 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
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
          </Button>
        }
        copy={error}
        eyebrow="Study Set Error"
        title="We couldn’t load this study set."
        tone="error"
      />
    );
  }

  if (!studySet) {
    return <LoadingSurface />;
  }

  async function handleLoadMoreFlashcards() {
    if (!flashcardCursor) {
      return;
    }

    setIsLoadingMoreFlashcards(true);

    try {
      const response = await fetchStudySetFlashcards(id, flashcardCursor);
      let mergedFlashcards: Flashcard[] = [];

      setFlashcards((current) => {
        mergedFlashcards = mergeFlashcards(current, response.items);
        return mergedFlashcards;
      });
      setStudySet((current) => {
        if (!current) {
          return current;
        }

        const nextStudySet = {
          ...current,
          flashcards: mergedFlashcards
        };
        writeCachedStudySet(nextStudySet);
        return nextStudySet;
      });
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
  const isPreviewOnly = !studySet.studyGuide && studySet.flashcards.length === 0 && flashcards.length === 0 && !studySet.sourceText;
  const studyStats = [
    {
      copy: "Active recall cards already generated for this pack.",
      icon: Layers3,
      label: "Flashcards",
      value: `${studySet.flashcardCount}`
    },
    {
      copy: "Saved oral exam attempts attached to the material.",
      icon: GraduationCap,
      label: "Exam sessions",
      value: isLoadingExamSessions ? "..." : `${examSessionCount}`
    },
    {
      copy:
        activeRescues.length > 0
          ? "Weak spots still waiting for another pass."
          : "Concepts already recovered through Rescue Mode.",
      icon: BrainCircuit,
      label: activeRescues.length > 0 ? "Open rescues" : "Recovered concepts",
      value: activeRescues.length > 0 ? `${activeRescues.length}` : `${recoveredRescues.length}`
    }
  ] as const;
  const mobileVisibleFlashcards = isMobileDeckExpanded ? flashcards : flashcards.slice(0, 2);

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
    target?.focus({ preventScroll: true });
  }

  return (
    <>
      <section className="space-y-4 overflow-x-hidden pb-6 lg:hidden">
        <Reveal>
          <Card className="relative min-w-0 overflow-hidden rounded-[1.8rem] border-white/10 bg-[linear-gradient(135deg,rgba(14,18,28,0.96),rgba(9,11,19,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
            <div aria-hidden="true" className="absolute inset-0">
              <div className="absolute right-[-18%] top-[-12%] h-44 w-44 rounded-full bg-[#4f7cff]/18 blur-3xl" />
              <div className="absolute bottom-[-20%] left-[-14%] h-40 w-40 rounded-full bg-[#ffb56f]/16 blur-3xl" />
            </div>

            <CardContent className="relative min-w-0 space-y-5 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                  Saved Study Set
                </Badge>
                <Badge className="rounded-full border border-white/8 bg-transparent px-3 py-1 text-[0.72rem] text-zinc-400">
                  {studySet.sourceType === "pdf" ? "PDF source" : "Text notes"}
                </Badge>
              </div>

              <div className="min-w-0 space-y-3">
                <h1 className="break-words [overflow-wrap:anywhere] font-[family-name:var(--font-display)] text-[2.1rem] leading-[0.96] text-white">
                  {studySet.title}
                </h1>
                <p className="break-words [overflow-wrap:anywhere] text-sm leading-6 text-zinc-300 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
                  {studySet.summary || "This study pack is still assembling its summary and detailed study guide."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {studyStats.map((stat) => (
                  <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.72rem] text-zinc-100" key={stat.label}>
                    {stat.label}: {stat.value}
                  </Badge>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  asChild
                  className={cn(
                    "h-12 rounded-full px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)]",
                    isPreviewOnly
                      ? "pointer-events-none opacity-50"
                      : "bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] hover:opacity-95"
                  )}
                >
                  <Link to={`/study-sets/${studySet.id}/exam?rescue=on`}>
                    Take Exam
                    <Sparkles className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  className={cn(
                    "h-12 rounded-full border border-white/10 px-5 text-sm font-semibold text-zinc-100",
                    isPreviewOnly
                      ? "pointer-events-none bg-white/[0.03] opacity-50"
                      : "bg-white/[0.04] hover:bg-white/[0.08]"
                  )}
                  variant="ghost"
                >
                  <Link to={`/study-sets/${studySet.id}/exam?rescue=off`}>Without Rescue</Link>
                </Button>
              </div>

              <Button
                asChild
                className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                variant="ghost"
              >
                <Link to="/saved">Back to Library</Link>
              </Button>
            </CardContent>
          </Card>
        </Reveal>

        {pageNotice ? (
          <Reveal delay={0.04}>
            <Card className="rounded-[1.4rem] border-amber-300/14 bg-amber-300/8 shadow-[0_18px_50px_rgba(0,0,0,0.18)]" role="status">
              <CardContent className="p-4 text-sm leading-7 text-amber-50">{pageNotice}</CardContent>
            </Card>
          </Reveal>
        ) : null}

        <Tabs className="min-w-0" defaultValue="flashcards">
          <Card className="overflow-hidden rounded-[1.8rem] border-white/10 bg-[linear-gradient(180deg,rgba(14,18,28,0.98),rgba(9,11,18,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
            <CardContent className="space-y-5 p-5">
              <div className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <TabsList className="grid h-11 w-full min-w-0 grid-cols-3 items-stretch gap-1 rounded-[1.05rem] bg-transparent p-0">
                  <TabsTrigger className="h-full min-w-0 rounded-[0.95rem] px-2 py-0 text-[0.82rem] leading-none text-zinc-400 data-[state=active]:bg-white/[0.08] data-[state=active]:text-white" value="overview">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger className="h-full min-w-0 rounded-[0.95rem] px-2 py-0 text-[0.82rem] leading-none text-zinc-400 data-[state=active]:bg-white/[0.08] data-[state=active]:text-white" value="guide">
                    Guide
                  </TabsTrigger>
                  <TabsTrigger className="h-full min-w-0 rounded-[0.95rem] px-2 py-0 text-[0.82rem] leading-none text-zinc-400 data-[state=active]:bg-white/[0.08] data-[state=active]:text-white" value="flashcards">
                    Flashcards
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent className="space-y-4" value="overview">
            <Reveal delay={0.05}>
              <Card className="rounded-[1.7rem] border-white/10 bg-[linear-gradient(180deg,rgba(13,18,28,0.96),rgba(9,11,18,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
                <CardContent className="space-y-5 p-5">
                  <div className="space-y-2">
                    <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                      Concept Map
                    </Badge>
                    <p className="text-sm leading-7 text-zinc-400">
                      Start with the highest-yield ideas, then narrow the guide when you want a cleaner pass.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Core concepts</p>
                    <div className="flex flex-wrap gap-2">
                      {coreConcepts.map((concept) => (
                        <button
                          aria-pressed={activeConcept === concept}
                          className={cn(
                            conceptButtonClass,
                            activeConcept === concept
                              ? "border-amber-300/18 bg-amber-300/10 text-amber-50"
                              : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/14 hover:bg-white/[0.08]"
                          )}
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
                    <div className="space-y-3">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Supporting concepts</p>
                      <div className="flex flex-wrap gap-2">
                        {supportingConcepts.map((concept) => (
                          <button
                            aria-pressed={activeConcept === concept}
                            className={cn(
                              conceptButtonClass,
                              activeConcept === concept
                                ? "border-amber-300/18 bg-amber-300/10 text-amber-50"
                                : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/14 hover:bg-white/[0.08]"
                            )}
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

                  {activeConcept ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-[1.3rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
                      <span>Guide filter:</span>
                      <Badge className="rounded-full border border-amber-300/18 bg-amber-300/10 px-3 py-1 text-[0.72rem] text-amber-50">
                        {activeConcept}
                      </Badge>
                      <Button
                        className="h-9 rounded-full border border-white/10 bg-white/[0.04] px-4 text-zinc-100 hover:bg-white/[0.08]"
                        onClick={() => setActiveConcept(null)}
                        type="button"
                        variant="ghost"
                      >
                        Clear
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </Reveal>

            {rescueAttempts.length > 0 ? (
              <Reveal delay={0.08}>
                <Card className="rounded-[1.7rem] border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
                  <CardContent className="space-y-4 p-5">
                    <div className="space-y-2">
                      <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                        Rescue History
                      </Badge>
                      <p className="text-sm leading-7 text-zinc-400">
                        Weak areas stay visible so the return loop knows where to focus next.
                      </p>
                    </div>

                    {activeRescues.length > 0 ? (
                      <div className="space-y-3">
                        {activeRescues.slice(0, 2).map((attempt) => (
                          <Card className="rounded-[1.3rem] border-amber-300/12 bg-amber-300/6 shadow-none" key={attempt.id}>
                            <CardContent className="space-y-2 p-4">
                              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Open rescue</p>
                              <h3 className="font-medium text-white">{attempt.concept}</h3>
                              <p className="text-sm leading-7 text-zinc-300">{attempt.diagnosis}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : null}

                    {recoveredRescues.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {recoveredRescues.slice(0, 6).map((attempt) => (
                          <Badge className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[0.72rem] text-emerald-100" key={attempt.id}>
                            {attempt.concept}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </Reveal>
            ) : null}
              </TabsContent>

              <TabsContent className="space-y-4" value="guide">
            <Reveal delay={0.05}>
              <Card className="rounded-[1.7rem] border-white/10 bg-[linear-gradient(180deg,rgba(13,18,28,0.96),rgba(9,11,18,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
                <CardContent className="space-y-5 p-5">
                  <div className="space-y-2">
                    <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                      Study Guide
                    </Badge>
                    <p className="text-sm leading-7 text-zinc-400">
                      Open only the sections you need right now instead of scrolling through the whole pack.
                    </p>
                  </div>

                  {studySet.studyGuide ? (
                    <StudyGuideRenderer activeConcept={activeConcept} content={studySet.studyGuide} />
                  ) : (
                    <Card className="rounded-[1.4rem] border-white/8 bg-white/[0.03] shadow-none">
                      <CardContent className="space-y-3 p-4">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Guide incoming</p>
                        <p className="text-sm leading-7 text-zinc-400">The full study guide is still loading from the live service.</p>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </Reveal>
              </TabsContent>

              <TabsContent className="space-y-4" value="flashcards">
            <Reveal delay={0.05}>
              <div className="min-w-0 space-y-5 px-1 pb-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                        Recall Layer
                      </Badge>
                      <h2 className="font-[family-name:var(--font-display)] text-3xl text-white">Flashcards</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[0.72rem] text-zinc-100">
                        {flashcards.length} loaded
                      </Badge>
                      <Badge className="rounded-full border border-white/8 bg-transparent px-3 py-1 text-[0.72rem] text-zinc-400">
                        {studySet.flashcardCount} total
                      </Badge>
                    </div>
                  </div>

                  {flashcards.length > 0 ? (
                    <div className="space-y-4">
                      <MobileFlashcardTrainer cards={flashcards} studySetId={studySet.id} />

                      <div className="min-w-0 space-y-4 rounded-[1.45rem] bg-white/[0.02] p-2">
                        <div className="flex items-center justify-between gap-3 px-2">
                          <h3 className="font-[family-name:var(--font-display)] text-2xl text-white">Loaded cards</h3>
                          <span className="text-sm text-zinc-500">Tap to flip</span>
                        </div>
                        <div className="grid gap-4">
                          {mobileVisibleFlashcards.map((card, index) => (
                            <MobileFlashcardListItem card={card} index={index} key={card.id} />
                          ))}
                        </div>
                        {flashcards.length > 2 ? (
                          <Button
                            className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]"
                            onClick={() => setIsMobileDeckExpanded((current) => !current)}
                            type="button"
                            variant="ghost"
                          >
                            {isMobileDeckExpanded ? "Show Fewer Cards" : `Show All ${flashcards.length} Loaded Cards`}
                          </Button>
                        ) : null}
                        {hasMoreFlashcards ? (
                          <Button
                            className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]"
                            disabled={isLoadingMoreFlashcards}
                            onClick={() => void handleLoadMoreFlashcards()}
                            type="button"
                            variant="ghost"
                          >
                            {isLoadingMoreFlashcards ? "Loading more flashcards..." : "Load More Flashcards"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Deck incoming</p>
                      <p className="mt-3 text-sm leading-7 text-zinc-400">
                        Flashcards will appear here once the live study-set details finish loading.
                      </p>
                    </div>
                  )}
              </div>
            </Reveal>
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      </section>

      <section className="hidden gap-6 pb-6 lg:grid xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
      <div className="space-y-6">
        <Reveal>
          <Card className="relative overflow-hidden rounded-[2rem] border-white/10 bg-[linear-gradient(135deg,rgba(14,18,28,0.96),rgba(9,11,19,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
            <div aria-hidden="true" className="absolute inset-0">
              <div className="absolute right-[-8%] top-[-10%] h-56 w-56 rounded-full bg-[#4f7cff]/18 blur-3xl" />
              <div className="absolute bottom-[-14%] left-[-6%] h-52 w-52 rounded-full bg-[#ffb56f]/16 blur-3xl" />
            </div>

            <CardContent className="relative space-y-7 p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                  Saved Study Set
                </Badge>
                <Badge className="rounded-full border border-white/8 bg-transparent px-3 py-1 text-[0.72rem] text-zinc-400">
                  {studySet.sourceType === "pdf" ? "PDF source" : "Text notes"}
                  {studySet.sourceFileName ? ` • ${studySet.sourceFileName}` : ""}
                </Badge>
              </div>

              <div className="space-y-4">
                <h1 className="max-w-4xl font-[family-name:var(--font-display)] text-4xl leading-[0.96] text-white sm:text-5xl xl:text-6xl">
                  {studySet.title}
                </h1>
                <p className="max-w-3xl text-base leading-8 text-zinc-300 sm:text-lg">
                  {studySet.summary || "This study pack is still assembling its summary and detailed study guide."}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {studyStats.map((stat, index) => (
                  <Reveal delay={0.05 * index} key={stat.label}>
                    <Card className="rounded-[1.5rem] border-white/10 bg-white/[0.05] shadow-none">
                      <CardContent className="space-y-3 p-5">
                        <span className="inline-flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-zinc-100">
                          <stat.icon className="size-5" />
                        </span>
                        <div className="space-y-1.5">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                            {stat.label}
                          </p>
                          <strong className="block font-[family-name:var(--font-display)] text-3xl leading-none text-white">
                            {stat.value}
                          </strong>
                        </div>
                        <p className="text-sm leading-7 text-zinc-400">{stat.copy}</p>
                      </CardContent>
                    </Card>
                  </Reveal>
                ))}
              </div>

              {pageNotice ? (
                <div
                  aria-live="polite"
                  className="rounded-[1.5rem] border border-amber-300/14 bg-amber-300/8 px-5 py-4 text-sm leading-7 text-amber-50"
                  role="status"
                >
                  {pageNotice}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button
                  asChild
                  className={cn(
                    "h-12 rounded-full px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)]",
                    isPreviewOnly
                      ? "pointer-events-none opacity-50"
                      : "bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] hover:opacity-95"
                  )}
                >
                  <Link to={`/study-sets/${studySet.id}/exam?rescue=on`}>
                    Take Exam With Rescue
                    <Sparkles className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  className={cn(
                    "h-12 rounded-full border border-white/10 px-5 text-sm font-semibold text-zinc-100",
                    isPreviewOnly
                      ? "pointer-events-none bg-white/[0.03] opacity-50"
                      : "bg-white/[0.04] hover:bg-white/[0.08]"
                  )}
                  variant="ghost"
                >
                  <Link to={`/study-sets/${studySet.id}/exam?rescue=off`}>Take Exam Without Rescue</Link>
                </Button>
                <Button
                  asChild
                  className="h-12 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                  variant="ghost"
                >
                  <Link to="/saved">Back to Library</Link>
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[0.72rem] text-zinc-300">
                  {isPreviewOnly ? "Waiting for full study set..." : isLoadingExamSessions ? "Loading exam history..." : `${examSessionCount} saved exam sessions`}
                </Badge>
                <Badge className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[0.72rem] text-zinc-300">
                  {activeRescues.length > 0
                    ? `${activeRescues.length} active rescue step${activeRescues.length === 1 ? "" : "s"}`
                    : `${recoveredRescues.length} rescued concept${recoveredRescues.length === 1 ? "" : "s"}`}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </Reveal>

        <Reveal delay={0.05}>
          <Card className="sticky top-24 rounded-[1.7rem] border-white/10 bg-black/30 shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <CardContent className="flex flex-wrap gap-3 p-4">
              {[
                { label: "Concepts", section: "concepts" as const },
                { label: "Guide", section: "guide" as const },
                { label: "Flashcards", section: "flashcards" as const }
              ].map((item) => (
                <button
                  aria-controls={`study-set-${item.section}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-100 transition hover:border-white/14 hover:bg-white/[0.08]"
                  key={item.section}
                  onClick={() => scrollToSection(item.section)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </CardContent>
          </Card>
        </Reveal>

        {rescueAttempts.length > 0 ? (
          <Reveal delay={0.08}>
            <Card className="rounded-[1.8rem] border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
              <CardContent className="space-y-6 p-6">
                <div className="space-y-3">
                  <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                    Rescue History
                  </Badge>
                  <h2 className="font-[family-name:var(--font-display)] text-3xl text-white">Weak moments don’t disappear. They get tracked.</h2>
                  <p className="text-sm leading-7 text-zinc-400">
                    Rescue Mode keeps a memory of where the learner struggled so the study pack can guide the return loop.
                  </p>
                </div>

                {recoveredRescues.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Recovered concepts</p>
                    <div className="flex flex-wrap gap-2">
                      {recoveredRescues.slice(0, 8).map((attempt) => (
                        <Badge className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[0.72rem] text-emerald-100" key={attempt.id}>
                          {attempt.concept}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeRescues.length > 0 ? (
                  <div className="grid gap-3">
                    {activeRescues.slice(0, 3).map((attempt) => (
                      <Card className="rounded-[1.4rem] border-amber-300/12 bg-amber-300/6 shadow-none" key={attempt.id}>
                        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between">
                          <div className="space-y-2">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Open rescue</p>
                            <h3 className="font-[family-name:var(--font-display)] text-2xl text-white">{attempt.concept}</h3>
                            <p className="max-w-2xl text-sm leading-7 text-zinc-300">{attempt.diagnosis}</p>
                          </div>
                          <Button
                            asChild
                            className="h-11 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
                          >
                            <Link to={`/study-sets/${studySet.id}/exam`}>
                              Resume Rescue
                              <ArrowRight className="size-4" />
                            </Link>
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </Reveal>
        ) : null}

        <Reveal delay={0.1}>
          <Card
            className="rounded-[1.8rem] border-white/10 bg-[linear-gradient(180deg,rgba(13,18,28,0.96),rgba(9,11,18,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.24)]"
            id="study-set-concepts"
            ref={conceptsSectionRef}
            tabIndex={-1}
          >
            <CardContent className="space-y-6 p-6 sm:p-7">
              <div className="space-y-3">
                <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                  Concept Map
                </Badge>
                <h2 className="font-[family-name:var(--font-display)] text-3xl text-white">Start with the ideas that unlock the whole set.</h2>
                <p className="text-sm leading-7 text-zinc-400">
                  Use the core ideas first, then move into the supporting concepts once the main structure feels stable.
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card className="rounded-[1.5rem] border-white/10 bg-white/[0.05] shadow-none">
                  <CardContent className="space-y-4 p-5">
                    <div className="space-y-2">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Core concepts</p>
                      <p className="text-sm leading-7 text-zinc-400">Start here for the highest-yield ideas in this material.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {coreConcepts.map((concept) => (
                        <button
                          aria-pressed={activeConcept === concept}
                          className={cn(
                            conceptButtonClass,
                            activeConcept === concept
                              ? "border-amber-300/18 bg-amber-300/10 text-amber-50"
                              : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/14 hover:bg-white/[0.08]"
                          )}
                          key={concept}
                          onClick={() => setActiveConcept((current) => (current === concept ? null : concept))}
                          type="button"
                        >
                          {concept}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-[1.5rem] border-white/8 bg-white/[0.03] shadow-none">
                  <CardContent className="space-y-4 p-5">
                    <div className="space-y-2">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Supporting concepts</p>
                      <p className="text-sm leading-7 text-zinc-400">Use these to tighten edges, examples, and smaller distinctions.</p>
                    </div>
                    {supportingConcepts.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {supportingConcepts.map((concept) => (
                        <button
                          aria-pressed={activeConcept === concept}
                          className={cn(
                            conceptButtonClass,
                            activeConcept === concept
                                ? "border-amber-300/18 bg-amber-300/10 text-amber-50"
                                : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/14 hover:bg-white/[0.08]"
                            )}
                            key={concept}
                            onClick={() => setActiveConcept((current) => (current === concept ? null : concept))}
                            type="button"
                          >
                            {concept}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm leading-7 text-zinc-500">This pack is currently focused on a tight core set of ideas.</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {activeConcept ? (
                <div className="flex flex-wrap items-center gap-3 rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
                  <span>Filtering the guide by:</span>
                  <Badge className="rounded-full border border-amber-300/18 bg-amber-300/10 px-3 py-1 text-[0.72rem] text-amber-50">
                    {activeConcept}
                  </Badge>
                  <Button
                    className="h-9 rounded-full border border-white/10 bg-white/[0.04] px-4 text-zinc-100 hover:bg-white/[0.08]"
                    onClick={() => setActiveConcept(null)}
                    type="button"
                    variant="ghost"
                  >
                    Clear filter
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </Reveal>

        <Reveal delay={0.12}>
          <Card
            className="rounded-[1.8rem] border-white/10 bg-[linear-gradient(180deg,rgba(13,18,28,0.96),rgba(9,11,18,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.24)]"
            id="study-set-guide"
            ref={guideSectionRef}
            tabIndex={-1}
          >
            <CardContent className="space-y-6 p-6 sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-3">
                  <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                    Study Guide
                  </Badge>
                  <h2 className="font-[family-name:var(--font-display)] text-3xl text-white">Read the material like a guided lesson, not a wall of notes.</h2>
                </div>
                <div className="max-w-sm text-sm leading-7 text-zinc-400">
                  Open only the sections you want to focus on and let the concept filter narrow the path.
                </div>
              </div>

              {studySet.studyGuide ? (
                <StudyGuideRenderer activeConcept={activeConcept} content={studySet.studyGuide} />
              ) : (
                <Card className="rounded-[1.5rem] border-white/8 bg-white/[0.03] shadow-none">
                  <CardContent className="space-y-3 p-5">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Guide incoming</p>
                    <p className="text-sm leading-7 text-zinc-400">The full study guide is still loading from the live service.</p>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </Reveal>
      </div>

      <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <Reveal delay={0.06}>
          <Card
            className="rounded-[2rem] border-white/10 bg-[linear-gradient(180deg,rgba(14,18,28,0.98),rgba(9,11,18,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.32)]"
            id="study-set-flashcards"
            ref={flashcardsSectionRef}
            tabIndex={-1}
          >
            <CardContent className="space-y-6 p-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-3">
                    <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                      Recall Layer
                    </Badge>
                    <div className="space-y-2">
                      <h2 className="font-[family-name:var(--font-display)] text-4xl text-white">Flashcards</h2>
                      <p className="text-sm leading-7 text-zinc-400">
                        Use the trainer for momentum, then scan the full card stack when you want a broader review pass.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[0.72rem] text-zinc-100">
                      {flashcards.length} loaded
                    </Badge>
                    <Badge className="rounded-full border border-white/8 bg-transparent px-3 py-1 text-[0.72rem] text-zinc-400">
                      {studySet.flashcardCount} total
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    {
                      copy: "Start with the mobile trainer for a quick repetition loop.",
                      icon: Orbit,
                      title: "Rapid reps"
                    },
                    {
                      copy: "Use the question phrasing to rehearse how you’ll speak in the exam.",
                      icon: BookOpenText,
                      title: "Exam alignment"
                    },
                    {
                      copy: "Return later and the deck remembers the rest of the system around it.",
                      icon: LibraryBig,
                      title: "Persistent memory"
                    }
                  ].map((item) => (
                    <Card className="rounded-[1.4rem] border-white/8 bg-white/[0.03] shadow-none" key={item.title}>
                      <CardContent className="space-y-3 p-4">
                        <span className="inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-zinc-100">
                          <item.icon className="size-[18px]" />
                        </span>
                        <h3 className="font-medium text-white">{item.title}</h3>
                        <p className="text-sm leading-7 text-zinc-400">{item.copy}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {flashcards.length > 0 ? (
                <div className="space-y-5">
                  <MobileFlashcardTrainer cards={flashcards} studySetId={studySet.id} />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-[family-name:var(--font-display)] text-2xl text-white">Full deck</h3>
                      <span className="text-sm text-zinc-500">Tap any card to flip it.</span>
                    </div>
                    <div className="grid gap-4">
                      {flashcards.map((card, index) => (
                        <FlashcardItem card={card} index={index} key={card.id} />
                      ))}
                    </div>
                    {hasMoreFlashcards ? (
                      <Button
                        className="h-12 w-full rounded-full border border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]"
                        disabled={isLoadingMoreFlashcards}
                        onClick={() => void handleLoadMoreFlashcards()}
                        type="button"
                        variant="ghost"
                      >
                        {isLoadingMoreFlashcards ? "Loading more flashcards..." : "Load More Flashcards"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <Card className="rounded-[1.6rem] border-white/8 bg-white/[0.03] shadow-none">
                  <CardContent className="space-y-3 p-5">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Deck incoming</p>
                    <p className="text-sm leading-7 text-zinc-400">
                      Flashcards will appear here once the live study-set details finish loading.
                    </p>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </Reveal>
      </div>
      </section>
    </>
  );
}
