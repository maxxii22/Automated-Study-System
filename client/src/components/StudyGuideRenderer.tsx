import { useEffect, useMemo, useState } from "react";

type StudyGuideRendererProps = {
  content: string;
  activeConcept?: string | null;
};

type GuideSection = {
  examFocus: string | null;
  id: string;
  keyIdea: string | null;
  points: string[];
  title: string;
  tone: "focus" | "support";
};

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "your",
  "are",
  "was",
  "you",
  "all",
  "php",
  "http"
]);

function splitStudyGuide(content: string): string[] {
  const normalized = content.trim();

  if (!normalized) {
    return [];
  }

  const inlineNormalized = normalized.replace(/\s+(?=\d+\.\s)/g, "\n");
  const numberedMatches = [...inlineNormalized.matchAll(/(?:^|\n)\s*\d+\.\s+/g)];

  if (numberedMatches.length > 1) {
    return numberedMatches
      .map((match, index) => {
        const start = match.index ?? 0;
        const nextStart = numberedMatches[index + 1]?.index ?? inlineNormalized.length;
        return inlineNormalized.slice(start, nextStart).replace(/^\s*\d+\.\s+/, "").trim();
      })
      .filter(Boolean);
  }

  return inlineNormalized
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);
}

function tokenizeConcept(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function normalizeGuidePoints(paragraphs: string[]): string[] {
  return paragraphs.flatMap((paragraph) =>
    paragraph
      .split(/\s*[•-]\s+/)
      .map((point) => point.trim())
      .filter(Boolean)
  );
}

export function StudyGuideRenderer({ content, activeConcept }: StudyGuideRendererProps) {
  const sections = splitStudyGuide(content);
  const normalizedConcept = activeConcept?.trim().toLowerCase() ?? "";
  const conceptTokens = activeConcept ? tokenizeConcept(activeConcept) : [];
  const filteredSections = useMemo(
    () =>
      normalizedConcept.length > 0
        ? sections.filter((section) => {
            const lowerSection = section.toLowerCase();

            if (lowerSection.includes(normalizedConcept)) {
              return true;
            }

            const matches = conceptTokens.filter((token) => lowerSection.includes(token)).length;
            return conceptTokens.length > 0 && matches >= Math.max(1, Math.ceil(conceptTokens.length / 2));
          })
        : sections,
    [conceptTokens, normalizedConcept, sections]
  );
  const guideSections = useMemo<GuideSection[]>(
    () =>
      filteredSections.map((section, index) => {
        const paragraphs = section
          .split(/\n+/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean);
        const title = paragraphs[0] ?? `Section ${index + 1}`;
        const bodyParagraphs = paragraphs.slice(1);
        const normalizedPoints = normalizeGuidePoints(bodyParagraphs);
        const keyIdea = bodyParagraphs[0] ?? null;
        const points = normalizedPoints.slice(keyIdea ? 1 : 0);
        const examFocus = points.length > 0 ? points[points.length - 1] : keyIdea;

        return {
          examFocus,
          id: `${index}-${title.toLowerCase().replace(/[^\w]+/g, "-")}`,
          keyIdea,
          points,
          title,
          tone: index % 2 === 0 ? "focus" : "support"
        };
      }),
    [filteredSections]
  );
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenSections((current) => {
      const nextState: Record<string, boolean> = {};

      guideSections.forEach((section, index) => {
        nextState[section.id] = current[section.id] ?? index === 0;
      });

      return nextState;
    });
  }, [guideSections]);

  if (sections.length === 0) {
    return null;
  }

  if (guideSections.length === 0) {
    return <p className="muted">No study guide sections matched this key concept yet.</p>;
  }

  return (
    <div className="study-guide-stack">
      {guideSections.map((section, index) => (
        <article
          className={section.tone === "focus" ? "study-guide-item study-guide-item-focus" : "study-guide-item study-guide-item-support"}
          key={section.id}
        >
          <button
            aria-expanded={openSections[section.id] ?? false}
            className="study-guide-toggle"
            onClick={() =>
              setOpenSections((current) => ({
                ...current,
                [section.id]: !current[section.id]
              }))
            }
            type="button"
          >
            <span className="study-guide-toggle-copy">
              <span className="study-guide-step-label">Section {index + 1}</span>
              <h4 className="study-guide-section-title">{section.title}</h4>
            </span>
            <span className="study-guide-toggle-mark">{openSections[section.id] ? "−" : "+"}</span>
          </button>

          {openSections[section.id] ? (
            <div className="study-guide-content">
              {section.keyIdea ? (
                <div className="study-guide-detail-block">
                  <span className="study-guide-detail-label">Key Idea</span>
                  <p>{section.keyIdea}</p>
                </div>
              ) : null}

              {section.points.length > 0 ? (
                <div className="study-guide-detail-block">
                  <span className="study-guide-detail-label">Key Points</span>
                  <ul className="study-guide-point-list">
                    {section.points.map((point) => (
                      <li key={`${section.id}-${point.slice(0, 24)}`}>{point}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {section.examFocus ? (
                <div className="study-guide-detail-block study-guide-exam-focus">
                  <span className="study-guide-detail-label">Exam Focus</span>
                  <p>{section.examFocus}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
