import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import type { StudySet } from "@automated-study-system/shared";

import { fetchStudySets } from "../lib/api";

export function HomePage() {
  const [studySets, setStudySets] = useState<StudySet[]>([]);

  useEffect(() => {
    fetchStudySets().then(setStudySets).catch(() => {
      setStudySets([]);
    });
  }, []);

  return (
    <section className="hero-grid">
      <div>
        <article className="hero-card">
          <p className="eyebrow">React • Node.js • Gemini API</p>
          <h1>Study Sphere</h1>
          <p className="hero-copy">
            Automated learning environment for generating structured study guides and active-recall flashcards from
            notes and PDFs.
          </p>
          <div className="chip-row">
            <span className="chip">React</span>
            <span className="chip">Node.js</span>
            <span className="chip">Gemini API</span>
          </div>
          <Link className="primary-button" to="/create">
            Create a Study Set
          </Link>
        </article>

        <article className="panel recent-panel">
          <div className="section-header">
            <h2>Recent Study Sets</h2>
          </div>
          {studySets.length === 0 ? (
            <p className="muted">Once you save a generated study pack, it will show up here.</p>
          ) : (
            <div className="recent-list">
              {studySets.map((set) => (
                <Link className="recent-item" key={set.id} to={`/study-sets/${set.id}`}>
                  <strong>{set.title}</strong>
                  <span>{set.flashcards.length} flashcards</span>
                </Link>
              ))}
            </div>
          )}
        </article>
      </div>

      <article className="info-panel">
        <h2>MVP Workflow</h2>
        <ol className="ordered-list">
          <li>Paste notes or lecture content.</li>
          <li>Generate a study guide and flashcards.</li>
          <li>Edit weak cards and keep the strong ones.</li>
          <li>Return later for active recall practice.</li>
        </ol>
      </article>
    </section>
  );
}
