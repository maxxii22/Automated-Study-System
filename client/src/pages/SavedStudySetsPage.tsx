import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { StudySet } from "@automated-study-system/shared";

import { fetchStudySets } from "../lib/api";

export function SavedStudySetsPage() {
  const [studySets, setStudySets] = useState<StudySet[]>([]);
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
            <Link className="recent-item" key={studySet.id} to={`/study-sets/${studySet.id}`}>
              <div className="recent-item-content">
                <strong className="recent-item-title">{studySet.title}</strong>
                <p className="muted">
                  {studySet.sourceType === "pdf"
                    ? `PDF${studySet.sourceFileName ? ` • ${studySet.sourceFileName}` : ""}`
                    : "Text notes"}
                </p>
                <p className="muted">{studySet.summary}</p>
              </div>
              <span className="recent-item-action">Open Set</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
