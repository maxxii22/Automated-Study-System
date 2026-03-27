type StudyGuideRendererProps = {
  content: string;
  activeConcept?: string | null;
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

export function StudyGuideRenderer({ content, activeConcept }: StudyGuideRendererProps) {
  const sections = splitStudyGuide(content);
  const normalizedConcept = activeConcept?.trim().toLowerCase() ?? "";
  const conceptTokens = activeConcept ? tokenizeConcept(activeConcept) : [];
  const filteredSections =
    normalizedConcept.length > 0
      ? sections.filter((section) => {
          const lowerSection = section.toLowerCase();

          if (lowerSection.includes(normalizedConcept)) {
            return true;
          }

          const matches = conceptTokens.filter((token) => lowerSection.includes(token)).length;
          return conceptTokens.length > 0 && matches >= Math.max(1, Math.ceil(conceptTokens.length / 2));
        })
      : sections;

  if (sections.length === 0) {
    return null;
  }

  if (filteredSections.length === 0) {
    return <p className="muted">No study guide sections matched this key concept yet.</p>;
  }

  return (
    <ol className="study-guide-list">
      {filteredSections.map((section, index) => (
        <li className="study-guide-item" key={`${index}-${section.slice(0, 24)}`}>
          {section.split(/\n+/).map((paragraph, paragraphIndex) =>
            paragraphIndex === 0 ? (
              <h4 className="study-guide-section-title" key={`${index}-${paragraphIndex}`}>
                {paragraph}
              </h4>
            ) : (
              <p key={`${index}-${paragraphIndex}`}>{paragraph}</p>
            )
          )}
        </li>
      ))}
    </ol>
  );
}
