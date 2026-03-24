import { Link } from "react-router-dom";

import landingImage from "../assets/landing/landingimagepage.png";

export function HomePage() {
  return (
    <section
      className="landing-page landing-page-full"
      style={{ backgroundImage: `linear-gradient(90deg, rgba(5, 10, 21, 0.86) 0%, rgba(6, 12, 25, 0.58) 34%, rgba(7, 14, 28, 0.12) 68%), url(${landingImage})` }}
    >
      <div className="landing-overlay">
        <p className="eyebrow">Study Smarter With AI</p>
        <h1>Turn notes and PDFs into study guides, flashcards, and oral exam practice.</h1>
        <p className="hero-copy landing-text">
          Study Sphere helps you go from raw material to active recall faster, so you can understand, revise, and
          practice in one place.
        </p>

        <div className="landing-points">
          <span>Generate structured study guides</span>
          <span>Practice with recall flashcards</span>
          <span>Train with adaptive oral exams</span>
        </div>

        <div className="landing-actions">
          <Link className="primary-button" to="/create">
            Start Studying
          </Link>
          <span className="landing-helper">Paste notes or upload a PDF to create your first study set.</span>
        </div>
      </div>
    </section>
  );
}
