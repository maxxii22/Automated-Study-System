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
      title: "Bring in your material",
      copy: "Paste notes, add copied transcript text, or upload a PDF from class, documentation, or technical reading.",
    },
    {
      title: "Generate structure instantly",
      copy: "Study Sphere turns dense material into an organized guide with key concepts you can actually work through.",
    },
    {
      title: "Practice active recall",
      copy: "Flip through flashcards and move into adaptive oral exam mode to test understanding instead of rereading.",
    },
  ];

  const productCards = [
    {
      eyebrow: "Study Guides",
      title: "From raw material to a clean revision path",
      copy: "Break long PDFs and scattered notes into a readable guide with sections, concepts, and a clear study flow.",
    },
    {
      eyebrow: "Flashcards",
      title: "Designed for active recall, not passive scanning",
      copy: "Use interactive cards to retrieve concepts before revealing the answer, helping weak spots show up faster.",
    },
    {
      eyebrow: "Oral Exam Mode",
      title: "Practice explaining what you know",
      copy: "Simulate a coach-style oral exam with adaptive follow-up questions that push you past surface-level memorization.",
    },
  ];

  const benefitPoints = [
    "Built for technical notes, course handouts, documentation, and ML basics",
    "Private per browser/device for personal revision workflows",
    "Clear separation between learning content and practice modes",
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
            <p className="eyebrow">Academic AI Workspace</p>
            <h1>Turn lecture notes, PDFs, and dense material into a study system you can actually use.</h1>
            <p className="landing-text landing-lead">
              Study Sphere transforms raw material into structured guides, interactive flashcards, and adaptive oral
              exam practice, so revision feels more focused and less overwhelming.
            </p>

            <div className="landing-actions landing-actions-row">
              <Link className="primary-button landing-primary" to="/create">
                Start Building a Study Set
              </Link>
              <Link className="secondary-button landing-secondary" to="/saved">
                View Saved Sets
              </Link>
            </div>

            <div className="landing-points landing-points-inline">
              <span>Study guides from notes and PDFs</span>
              <span>Flashcards with flip-based recall</span>
              <span>Adaptive oral exam practice</span>
            </div>
          </div>

          <div className="landing-showcase">
            <div className="landing-showcase-panel reveal-on-scroll is-visible" data-reveal>
              <p className="eyebrow">How It Works</p>
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
          <h2>Built for serious revision, not just content generation.</h2>
          <p>
            The app is designed to move you from information overload to retrieval practice. Instead of dumping raw AI
            output, it helps you organize, revisit, and test what matters.
          </p>
        </div>

        <div className="landing-feature-grid">
          {productCards.map((card) => (
            <article className="landing-feature-card reveal-on-scroll" data-reveal key={card.title}>
              <p className="eyebrow">{card.eyebrow}</p>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-proof">
        <div className="landing-proof-panel reveal-on-scroll" data-reveal>
          <div className="landing-proof-copy reveal-on-scroll" data-reveal>
            <p className="eyebrow">Product Focus</p>
            <h2>One app, three study behaviors that reinforce each other.</h2>
            <p>
              Read for structure, revise by concept, and then force retrieval with flashcards and oral questioning.
              That combination is what makes the workflow feel useful for academic and technical learning.
            </p>
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
            <h2>Bring in your next document and turn it into a better revision flow.</h2>
            <p>
              Paste content or upload a PDF, generate your study pack, and move straight into active recall.
            </p>
          </div>
          <div className="landing-actions landing-actions-row">
            <Link className="primary-button landing-primary" to="/create">
              Create a Study Set
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
