import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { StudySet } from "@automated-study-system/shared";

import { deleteStudySet, fetchStudySets } from "../lib/api";

export function SavedStudySetsPage() {
  const navigate = useNavigate();
  const [studySets, setStudySets] = useState<StudySet[]>([]);
  const [studySetPendingDelete, setStudySetPendingDelete] = useState<StudySet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    fetchStudySets()
      .then((items) => {
        if (!ignore) {
          setStudySets(items);
        }
      })
      .catch((requestError) => {
        if (!ignore) {
          setError(requestError instanceof Error ? requestError.message : "Could not load saved study sets.");
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  if (error) {
    return <section className="panel">{error}</section>;
  }

  function promptDelete(event: React.MouseEvent<HTMLButtonElement>, studySet: StudySet) {
    event.preventDefault();
    event.stopPropagation();
    setStudySetPendingDelete(studySet);
  }

  async function confirmDelete() {
    if (!studySetPendingDelete) {
      return;
    }

    await deleteStudySet(studySetPendingDelete.id);
    setStudySets((current) => current.filter((studySet) => studySet.id !== studySetPendingDelete.id));
    setStudySetPendingDelete(null);
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

      {studySets.length === 0 ? (
        <p className="muted">No saved study sets on this device yet. Create one from text notes or a PDF to get started.</p>
      ) : (
        <div className="recent-list">
          {studySets.map((studySet) => (
            <article
              className="recent-item"
              key={studySet.id}
              onClick={() => navigate(`/study-sets/${studySet.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate(`/study-sets/${studySet.id}`);
                }
              }}
              role="link"
              tabIndex={0}
            >
              <div className="recent-item-content">
                <strong className="recent-item-title">{studySet.title}</strong>
                <p className="muted">
                  {studySet.sourceType === "pdf"
                    ? `PDF${studySet.sourceFileName ? ` • ${studySet.sourceFileName}` : ""}`
                    : "Text notes"}
                </p>
                <p className="muted">{studySet.summary}</p>
              </div>
              <div className="recent-item-actions">
                <Link
                  className="recent-item-action"
                  onClick={(event) => event.stopPropagation()}
                  to={`/study-sets/${studySet.id}`}
                >
                  Open Set
                </Link>
                <button className="danger-button" onClick={(event) => promptDelete(event, studySet)} type="button">
                  Delete Set
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {studySetPendingDelete ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setStudySetPendingDelete(null)}>
          <div className="content-modal confirm-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="content-modal-header">
              <div>
                <h2>Delete study set?</h2>
                <p className="muted">
                  This will remove <strong>{studySetPendingDelete.title}</strong> and its saved exam sessions from this device.
                </p>
              </div>
            </div>

            <div className="content-modal-actions confirm-actions">
              <button className="secondary-button" onClick={() => setStudySetPendingDelete(null)} type="button">
                Cancel
              </button>
              <button className="danger-button" onClick={() => void confirmDelete()} type="button">
                Delete Set
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
