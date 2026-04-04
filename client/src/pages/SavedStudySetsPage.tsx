import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";

import type { StudySetListItem } from "@automated-study-system/shared";
import {
  ArrowRight,
  BookOpenText,
  Clock3,
  FileText,
  Layers3,
  Sparkles,
  Trash2
} from "lucide-react";

import { Reveal } from "@/components/Reveal";
import { StatePanel } from "@/components/StatePanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { deleteStudySet, fetchStudySets } from "../lib/api";

const SAVED_STUDY_SETS_CACHE_KEY = "study-sphere.saved-study-sets-cache";

type SavedStudySetsCache = {
  items: StudySetListItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

function readCachedStudySets(): SavedStudySetsCache | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(SAVED_STUDY_SETS_CACHE_KEY);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as SavedStudySetsCache;
  } catch {
    return null;
  }
}

function writeCachedStudySets(payload: SavedStudySetsCache) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(SAVED_STUDY_SETS_CACHE_KEY, JSON.stringify(payload));
}

function formatRelativeUpdateTime(value: string) {
  const updatedAt = new Date(value);
  const deltaMs = Date.now() - updatedAt.getTime();

  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return "Updated recently";
  }

  const minutes = Math.floor(deltaMs / (60 * 1000));
  if (minutes < 1) {
    return "Updated just now";
  }

  if (minutes < 60) {
    return `Updated ${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Updated ${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `Updated ${days}d ago`;
  }

  return `Updated ${updatedAt.toLocaleDateString()}`;
}

function LoadingCard() {
  return (
    <Card className="rounded-[1.8rem] border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-5 w-24 rounded-full bg-white/8" />
          <Skeleton className="h-5 w-28 rounded-full bg-white/8" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-8 w-3/4 bg-white/8" />
          <Skeleton className="h-4 w-1/3 bg-white/8" />
          <Skeleton className="h-4 w-full bg-white/8" />
          <Skeleton className="h-4 w-11/12 bg-white/8" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-11 w-36 rounded-full bg-white/8" />
          <Skeleton className="h-11 w-24 rounded-full bg-white/8" />
        </div>
      </CardContent>
    </Card>
  );
}

export function SavedStudySetsPage() {
  const [studySets, setStudySets] = useState<StudySetListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [studySetPendingDelete, setStudySetPendingDelete] = useState<StudySetListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const totalFlashcards = studySets.reduce((sum, studySet) => sum + studySet.flashcardCount, 0);
  const pdfCount = studySets.filter((studySet) => studySet.sourceType === "pdf").length;
  const latestUpdatedCopy = studySets[0] ? formatRelativeUpdateTime(studySets[0].updatedAt) : "No activity yet";
  const textCount = studySets.length - pdfCount;

  async function loadStudySets() {
    const response = await fetchStudySets();
    setStudySets(response.items);
    setNextCursor(response.page.nextCursor ?? null);
    setHasMore(response.page.hasMore);
    setError(null);
    writeCachedStudySets({
      items: response.items,
      nextCursor: response.page.nextCursor ?? null,
      hasMore: response.page.hasMore
    });
  }

  useEffect(() => {
    let ignore = false;
    const cached = readCachedStudySets();

    if (cached) {
      setStudySets(cached.items);
      setNextCursor(cached.nextCursor);
      setHasMore(cached.hasMore);
      setIsLoading(false);
    }

    loadStudySets()
      .then(() => {
        if (!ignore) {
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!ignore) {
          setError(requestError instanceof Error ? requestError.message : "Could not load saved study sets.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  if (error) {
    return (
      <StatePanel
        actions={
          <Button
            className="h-11 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
            onClick={() => {
              setIsLoading(true);
              void loadStudySets()
                .catch((requestError) => {
                  setError(requestError instanceof Error ? requestError.message : "Could not load saved study sets.");
                })
                .finally(() => {
                  setIsLoading(false);
                });
            }}
            type="button"
          >
            Try Again
          </Button>
        }
        copy={error}
        eyebrow="Library Error"
        title="We couldn’t load your saved study sets."
        tone="error"
      />
    );
  }

  function promptDelete(event: MouseEvent<HTMLButtonElement>, studySet: StudySetListItem) {
    event.preventDefault();
    event.stopPropagation();
    setStudySetPendingDelete(studySet);
  }

  async function confirmDelete() {
    if (!studySetPendingDelete) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteStudySet(studySetPendingDelete.id);
      setStudySets((current) => {
        const nextItems = current.filter((studySet) => studySet.id !== studySetPendingDelete.id);
        writeCachedStudySets({
          items: nextItems,
          nextCursor,
          hasMore
        });
        return nextItems;
      });
      setStudySetPendingDelete(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete the study set.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleLoadMore() {
    if (!nextCursor) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const response = await fetchStudySets(nextCursor);
      setStudySets((current) => {
        const nextItems = [...current, ...response.items];
        writeCachedStudySets({
          items: nextItems,
          nextCursor: response.page.nextCursor ?? null,
          hasMore: response.page.hasMore
        });
        return nextItems;
      });
      setNextCursor(response.page.nextCursor ?? null);
      setHasMore(response.page.hasMore);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load more study sets.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <>
      <section className="space-y-8 pb-6">
        <Reveal className="hidden lg:block">
          <Card className="relative overflow-hidden rounded-[2rem] border-white/10 bg-[linear-gradient(135deg,rgba(14,18,28,0.96),rgba(10,12,22,0.92))] shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
            <div aria-hidden="true" className="absolute inset-0">
              <div className="absolute left-[-8%] top-[-12%] h-48 w-48 rounded-full bg-[#4f7cff]/18 blur-3xl" />
              <div className="absolute bottom-[-18%] right-[-6%] h-56 w-56 rounded-full bg-[#ffb56f]/16 blur-3xl" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />
            </div>

            <CardContent className="relative grid gap-8 p-6 sm:p-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)] xl:items-end">
              <div className="space-y-6">
                <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-zinc-100">
                  Learning Library
                </Badge>
                <div className="space-y-4">
                  <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-[0.94] tracking-tight text-white sm:text-5xl xl:text-6xl">
                    Saved study packs that feel worth reopening.
                  </h1>
                  <p className="max-w-2xl text-base leading-8 text-zinc-300 sm:text-lg">
                    Every generated pack becomes part of a warmer, calmer revision system. Your notes, flashcards,
                    summaries, and exam history stay ready for the next return visit.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    asChild
                    className="h-12 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
                  >
                    <Link to="/create">
                      Create New Set
                      <Sparkles className="size-4" />
                    </Link>
                  </Button>
                  <div className="inline-flex min-h-12 items-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-300">
                    Latest activity: {latestUpdatedCopy}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                {[
                  {
                    copy: "Structured packs sitting in your persistent library.",
                    icon: Layers3,
                    label: "Saved packs",
                    value: studySets.length
                  },
                  {
                    copy: "Recall reps already generated and ready to use.",
                    icon: BookOpenText,
                    label: "Flashcards",
                    value: totalFlashcards
                  },
                  {
                    copy: `${pdfCount} PDF imports and ${textCount} text-driven packs.`,
                    icon: FileText,
                    label: "Source mix",
                    value: studySets.length > 0 ? `${pdfCount}/${textCount}` : "0/0"
                  }
                ].map((stat, index) => (
                  <Reveal delay={0.06 * index} key={stat.label}>
                    <Card className="rounded-[1.6rem] border-white/10 bg-white/[0.05] shadow-none backdrop-blur-xl">
                      <CardContent className="flex items-start justify-between gap-4 p-5">
                        <div className="space-y-2">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                            {stat.label}
                          </p>
                          <strong className="block font-[family-name:var(--font-display)] text-3xl leading-none text-white">
                            {stat.value}
                          </strong>
                          <p className="text-sm leading-7 text-zinc-400">{stat.copy}</p>
                        </div>
                        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-zinc-100">
                          <stat.icon className="size-5" />
                        </span>
                      </CardContent>
                    </Card>
                  </Reveal>
                ))}
              </div>
            </CardContent>
          </Card>
        </Reveal>

        <Reveal className="lg:hidden">
          <Card className="relative overflow-hidden rounded-[1.8rem] border-white/10 bg-[linear-gradient(135deg,rgba(14,18,28,0.96),rgba(10,12,22,0.92))] shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
            <div aria-hidden="true" className="absolute inset-0">
              <div className="absolute left-[-18%] top-[-12%] h-40 w-40 rounded-full bg-[#4f7cff]/18 blur-3xl" />
              <div className="absolute bottom-[-18%] right-[-12%] h-44 w-44 rounded-full bg-[#ffb56f]/16 blur-3xl" />
            </div>

            <CardContent className="relative space-y-4 p-5">
              <div className="space-y-3">
                <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-zinc-100">
                  Learning Library
                </Badge>
                <h1 className="font-[family-name:var(--font-display)] text-[2.35rem] leading-[0.94] tracking-tight text-white">
                  Saved packs, ready to reopen.
                </h1>
                <p className="text-sm leading-6 text-zinc-300">
                  Jump back into recall, review, or exam practice without digging through clutter.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.72rem] text-zinc-100">
                  {studySets.length} packs
                </Badge>
                <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.72rem] text-zinc-100">
                  {totalFlashcards} flashcards
                </Badge>
                <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.72rem] text-zinc-300">
                  {latestUpdatedCopy}
                </Badge>
              </div>

              <Button
                asChild
                className="h-12 w-full rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
              >
                <Link to="/create">
                  Create New Set
                  <Sparkles className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </Reveal>

        <Reveal className="hidden lg:block" delay={0.08}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-zinc-500">Library Stack</p>
              <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-white sm:text-4xl">
                Revisit material with context still attached.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-zinc-400 sm:text-right">
              Open any pack to continue recall, review the study guide, or jump straight into the adaptive oral exam.
            </p>
          </div>
        </Reveal>

        {isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Reveal delay={0.08 * index} key={index}>
                <LoadingCard />
              </Reveal>
            ))}
          </div>
        ) : studySets.length === 0 ? (
          <Reveal delay={0.12}>
            <Card className="overflow-hidden rounded-[2rem] border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
              <CardContent className="space-y-6 p-8 sm:p-10">
                <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                  Empty Library
                </Badge>
                <div className="space-y-4">
                  <h2 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-white">
                    No saved study sets yet.
                  </h2>
                  <p className="max-w-2xl text-base leading-8 text-zinc-300">
                    Generate a pack from notes or a PDF and it will show up here with its summary, flashcards, and exam
                    history ready for future review.
                  </p>
                </div>
                <Button
                  asChild
                  className="h-12 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
                >
                  <Link to="/create">
                    Create Your First Set
                    <Sparkles className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </Reveal>
        ) : (
          <div className="grid gap-4">
            {studySets.map((studySet, index) => {
              const sourceLabel = studySet.sourceType === "pdf" ? "PDF import" : "Text notes";

              return (
                <Reveal delay={0.05 * index} key={studySet.id}>
                  <Card
                    className={cn(
                      "group relative overflow-hidden rounded-[1.9rem] border-white/10 bg-[linear-gradient(180deg,rgba(13,17,27,0.94),rgba(9,11,19,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.24)] transition duration-300 hover:-translate-y-1 hover:border-white/16 hover:shadow-[0_34px_90px_rgba(0,0,0,0.34)]"
                    )}
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,181,111,0.12),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(79,124,255,0.12),transparent_28%)] opacity-0 transition duration-300 group-hover:opacity-100"
                    />

                    <CardContent className="relative min-w-0 grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                      <div className="min-w-0 space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-zinc-100">
                            {sourceLabel}
                          </Badge>
                          <Badge className="rounded-full border border-white/8 bg-transparent px-3 py-1 text-[0.68rem] font-medium uppercase tracking-[0.22em] text-zinc-400">
                            {studySet.flashcardCount} flashcards
                          </Badge>
                          <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[0.72rem] font-medium text-zinc-400">
                            <Clock3 className="size-3.5" />
                            {formatRelativeUpdateTime(studySet.updatedAt)}
                          </span>
                        </div>

                        <div className="min-w-0 space-y-3">
                          <h3 className="min-w-0 break-words [overflow-wrap:anywhere] font-[family-name:var(--font-display)] text-[1.82rem] leading-[1.02] text-white sm:text-[2.1rem]">
                            {studySet.title}
                          </h3>
                          <p className="max-w-3xl break-words [overflow-wrap:anywhere] text-sm leading-6 text-zinc-300 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden sm:text-base sm:leading-8 sm:[-webkit-line-clamp:3]">
                            {studySet.summary ? studySet.summary : "Summary available. Open the pack to continue studying."}
                          </p>
                        </div>
                      </div>

                      <div className="min-w-0 grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:flex sm:flex-row lg:grid lg:grid-cols-1 lg:items-end">
                        <Button
                          asChild
                          className="h-11 w-full rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
                        >
                          <Link
                            aria-label={`Open ${studySet.title}`}
                            onClick={(event) => event.stopPropagation()}
                            state={{ studySetPreview: studySet }}
                            to={`/study-sets/${studySet.id}`}
                          >
                            Open Pack
                            <ArrowRight className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          aria-label={`Delete ${studySet.title}`}
                          className="h-11 rounded-full border border-rose-400/22 bg-rose-400/8 px-3.5 text-sm font-semibold text-rose-100 hover:bg-rose-400/14 sm:px-5"
                          onClick={(event) => promptDelete(event, studySet)}
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-4" />
                          <span className="hidden sm:inline">Delete</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Reveal>
              );
            })}
          </div>
        )}

        {hasMore ? (
          <Reveal delay={0.14}>
            <div className="flex justify-center pt-2">
              <Button
                className="h-12 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                disabled={isLoadingMore}
                onClick={() => void handleLoadMore()}
                type="button"
                variant="ghost"
              >
                {isLoadingMore ? "Loading more..." : "Load More Study Sets"}
              </Button>
            </div>
          </Reveal>
        ) : null}
      </section>

      <AlertDialog open={studySetPendingDelete !== null} onOpenChange={(open) => !open && setStudySetPendingDelete(null)}>
        <AlertDialogContent className="rounded-[1.8rem] border-white/10 bg-[#0d111b]/96 text-white shadow-[0_30px_90px_rgba(0,0,0,0.52)]">
          <AlertDialogHeader className="items-start text-left">
            <Badge className="rounded-full border border-rose-400/22 bg-rose-400/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-rose-100">
              Delete Study Set
            </Badge>
            <AlertDialogTitle className="font-[family-name:var(--font-display)] text-3xl leading-tight text-white">
              Remove this study pack from the library?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-7 text-zinc-400">
              {studySetPendingDelete
                ? `This will delete ${studySetPendingDelete.title} and its saved exam sessions from the app.`
                : "This study pack and its exam sessions will be removed from the app."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:justify-start">
            <AlertDialogCancel className="h-11 rounded-full border-white/10 bg-white/[0.04] px-5 text-zinc-100 hover:bg-white/[0.08]">
              Keep It
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-full border border-rose-400/22 bg-rose-400/14 px-5 text-rose-100 hover:bg-rose-400/20"
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              variant="ghost"
            >
              {isDeleting ? "Deleting..." : "Delete Set"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
