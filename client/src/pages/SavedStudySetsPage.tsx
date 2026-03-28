import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { StudySetListItem } from "@automated-study-system/shared";

import { StatePanel } from "../components/StatePanel";
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

export function SavedStudySetsPage() {
  const navigate = useNavigate();
  const [studySets, setStudySets] = useState<StudySetListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [studySetPendingDelete, setStudySetPendingDelete] = useState<StudySetListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <button
            className="primary-button"
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
          </button>
        }
        copy={error}
        eyebrow="Library Error"
        title="We couldn’t load your saved study sets."
        tone="error"
      />
    );
  }

  function promptDelete(event: React.MouseEvent<HTMLButtonElement>, studySet: StudySetListItem) {
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
    <section className="panel recent-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Your Library</p>
          <h1>Saved Study Sets</h1>
        </div>
        <Link className="primary-button" to="/create">
          Create New Set
        </Link>
      </div>

      {isLoading ? (
        <div className="recent-list">
          {Array.from({ length: 3 }).map((_, index) => (
            <article className="recent-item recent-item-skeleton" key={index}>
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
              <div className="skeleton-line skeleton-short" />
            </article>
          ))}
        </div>
      ) : studySets.length === 0 ? (
        <div className="empty-state-card">
          <h2>No saved study sets yet</h2>
          <p className="muted">Generate a study pack from notes or a PDF and it will appear here with flashcards and exam history.</p>
          <Link className="primary-button" to="/create">
            Create Your First Set
          </Link>
        </div>
      ) : (
        <div className="recent-list">
          {studySets.map((studySet) => (
            <article
              className="recent-item"
              key={studySet.id}
              onClick={() => navigate(`/study-sets/${studySet.id}`, { state: { studySetPreview: studySet } })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate(`/study-sets/${studySet.id}`, { state: { studySetPreview: studySet } });
                }
              }}
              role="link"
              tabIndex={0}
            >
              <div className="recent-item-content">
                <strong className="recent-item-title">{studySet.title}</strong>
                <p className="recent-item-source">
                  {studySet.sourceType === "pdf" ? "PDF" : "Paste"}
                </p>
                <p className="recent-item-meta">
                  {studySet.flashcardCount} flashcards • {formatRelativeUpdateTime(studySet.updatedAt)}
                </p>
                <p className="recent-item-preview">
                  {studySet.summary ? studySet.summary : "Summary available"}
                </p>
              </div>
              <div className="recent-item-actions">
                <Link
                  className="recent-item-action recent-item-open"
                  onClick={(event) => event.stopPropagation()}
                  state={{ studySetPreview: studySet }}
                  to={`/study-sets/${studySet.id}`}
                >
                  Open
                </Link>
                <button className="danger-button" onClick={(event) => promptDelete(event, studySet)} type="button">
                  Delete Set
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {hasMore ? (
        <button className="secondary-button" disabled={isLoadingMore} onClick={() => void handleLoadMore()} type="button">
          {isLoadingMore ? "Loading..." : "Load More"}
        </button>
      ) : null}

      {studySetPendingDelete ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setStudySetPendingDelete(null)}>
          <div className="content-modal confirm-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="content-modal-header">
              <div>
                <h2>Delete study set?</h2>
                <p className="muted">
                  This will remove <strong>{studySetPendingDelete.title}</strong> and its saved exam sessions from the app.
                </p>
              </div>
            </div>

            <div className="content-modal-actions confirm-actions">
              <button className="secondary-button" onClick={() => setStudySetPendingDelete(null)} type="button">
                Cancel
              </button>
              <button className="danger-button" disabled={isDeleting} onClick={() => void confirmDelete()} type="button">
                {isDeleting ? "Deleting..." : "Delete Set"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
