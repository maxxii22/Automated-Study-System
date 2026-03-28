import { useEffect } from "react";
import { Link } from "react-router-dom";

import landingImage from "../assets/landing/landingimagepage.png";

export function HomePage() {
  useEffect(() => {
    const revealTargets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (!revealTargets.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.18,
        rootMargin: "0px 0px -8% 0px",
      },
    );

    revealTargets.forEach((target) => observer.observe(target));

    return () => {
      observer.disconnect();
    };
  }, []);

  const workflowSteps = [
    {
      title: "Paste your notes",
      copy: "Drop in class notes, copied text, or a transcript.",
    },
    {
      title: "Get structured output instantly",
      copy: "Study Sphere turns it into summaries, flashcards, and practice.",
    },
    {
      title: "Study and fix weak areas",
      copy: "Use flashcards, oral exam mode, and Rescue Mode to improve fast.",
    },
  ];

  const productCards = [
    {
      eyebrow: "Study Guides",
      title: "From raw material to a clean revision path",
      points: [
        "Break notes into structured summaries",
        "Highlight the ideas worth revising first",
        "Keep revision clean instead of overwhelming",
      ],
    },
    {
      eyebrow: "Flashcards",
      title: "Designed for active recall, not passive scanning",
      points: [
        "Turn key concepts into recall cards",
        "Reveal weak spots faster than rereading",
        "Build momentum with one card at a time",
      ],
    },
    {
      eyebrow: "Oral Exam Mode",
      title: "Practice explaining what you know",
      points: [
        "Answer out loud with adaptive follow-up",
        "Keep saved sessions tied to your account",
        "Get scored feedback instead of guessing",
      ],
    },
    {
      eyebrow: "Rescue Mode",
      title: "Turn weak answers into a fast correction loop",
      points: [
        "Catch weak answers the moment they happen",
        "Get a quick reset instead of stalling",
        "Retry before moving on",
      ],
    },
  ];

  const benefitPoints = [
    "Saved sets, PDF jobs, exam sessions, and rescue progress stay attached to your account",
    "Built for course notes, handouts, documentation, and dense reading",
    "Summaries, flashcards, exams, and recovery loops reinforce each other in one flow",
  ];

  return (
    <div className="landing-page">
      <section
        className="landing-hero"
        style={{
          backgroundImage: `linear-gradient(112deg, rgba(7, 14, 28, 0.9) 0%, rgba(8, 17, 32, 0.7) 38%, rgba(13, 25, 42, 0.28) 64%, rgba(13, 25, 42, 0.12) 100%), url(${landingImage})`,
        }}
      >
        <div className="landing-hero-inner">
          <div className="landing-copy">
            <p className="eyebrow">Exam-ready study in seconds</p>
            <h1>Turn your notes into exam-ready study material in seconds.</h1>
            <p className="landing-text landing-lead">
              Summaries, flashcards, and practice all from your notes.
            </p>
            <p className="landing-emotion-copy">Stop feeling overwhelmed by your notes. Study without the stress.</p>

            <div className="landing-actions landing-actions-row">
              <Link className="primary-button landing-primary" to="/create">
                Paste Notes To Start
              </Link>
              <Link className="secondary-button landing-secondary" to="/saved">
                Open Your Library
              </Link>
            </div>

            <div className="landing-speed-signals">
              <span className="landing-speed-pill">Results in seconds</span>
              <span className="landing-speed-pill">No waiting. No setup.</span>
            </div>

            <div className="landing-points landing-points-inline">
              <span>Break notes into summaries</span>
              <span>Create flashcards automatically</span>
              <span>Track weak areas as you study</span>
            </div>
          </div>

          <div className="landing-showcase">
            <div className="landing-showcase-panel reveal-on-scroll is-visible" data-reveal>
              <p className="eyebrow">Live Preview</p>
              <div className="landing-preview-flow">
                <article className="landing-preview-input">
                  <span className="landing-preview-label">Input</span>
                  <p>&ldquo;Photosynthesis is the process by which plants convert sunlight into energy...&rdquo;</p>
                </article>
                <div className="landing-preview-arrow" aria-hidden="true">
                  <span />
                </div>
                <article className="landing-preview-output">
                  <div className="landing-preview-section">
                    <span className="landing-preview-label">Summary</span>
                    <strong>Plants convert sunlight into usable energy.</strong>
                  </div>
                  <div className="landing-preview-section">
                    <span className="landing-preview-label">Key Points</span>
                    <ul>
                      <li>Happens in chloroplasts</li>
                      <li>Uses carbon dioxide and water</li>
                    </ul>
                  </div>
                  <div className="landing-preview-section">
                    <span className="landing-preview-label">Practice</span>
                    <p>Where does photosynthesis occur?</p>
                  </div>
                </article>
              </div>
              <p className="eyebrow landing-showcase-kicker">How It Works</p>
              <div className="landing-step-list">
                {workflowSteps.map((step, index) => (
                  <article className="landing-step-card reveal-on-scroll" data-reveal key={step.title}>
                    <span className="landing-step-number">0{index + 1}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.copy}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-story">
        <div className="landing-section-heading reveal-on-scroll" data-reveal>
          <p className="eyebrow">Why Study Sphere</p>
          <h2>Stop re-reading. Start remembering.</h2>
          <ul className="landing-copy-list">
            <li>Break dense notes into summaries you can scan fast</li>
            <li>Create flashcards automatically from the same material</li>
            <li>Study, test weak spots, and keep progress tied to your account</li>
          </ul>
        </div>

        <div className="landing-feature-marquee reveal-on-scroll" data-reveal>
          <div className="landing-feature-track">
            {[...productCards, ...productCards].map((card, index) => (
              <article
                aria-hidden={index >= productCards.length}
                className="landing-feature-card landing-feature-card-loop"
                key={`${card.title}-${index}`}
              >
                <p className="eyebrow">{card.eyebrow}</p>
                <h3>{card.title}</h3>
                <ul className="landing-feature-points">
                  {card.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-proof">
        <div className="landing-proof-panel reveal-on-scroll" data-reveal>
          <div className="landing-proof-copy reveal-on-scroll" data-reveal>
            <p className="eyebrow">Product Focus</p>
            <h2>One app, three study behaviors that reinforce each other.</h2>
            <ul className="landing-copy-list">
              <li>Read for structure with a cleaner guide</li>
              <li>Revise by concept with flashcards and oral questioning</li>
              <li>Recover weak answers before they turn into repeated mistakes</li>
            </ul>
          </div>

          <div className="landing-benefit-list">
            {benefitPoints.map((point) => (
              <div className="landing-benefit-item reveal-on-scroll" data-reveal key={point}>
                <span className="landing-benefit-dot" />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-cta">
        <div className="landing-cta-panel reveal-on-scroll" data-reveal>
          <div>
            <p className="eyebrow">Ready To Start</p>
            <h2>Turn your next document into a study set in seconds.</h2>
            <ul className="landing-copy-list">
              <li>Paste content or upload a PDF</li>
              <li>Get summaries, flashcards, and practice fast</li>
              <li>Move straight into saved revision and recovery loops</li>
            </ul>
          </div>
          <div className="landing-actions landing-actions-row">
            <Link className="primary-button landing-primary" to="/create">
              Try It Now
            </Link>
            <Link className="secondary-button landing-secondary" to="/saved">
              Open Your Library
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
