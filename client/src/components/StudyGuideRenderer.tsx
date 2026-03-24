type StudyGuideRendererProps = {
  content: string;
};

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

export function StudyGuideRenderer({ content }: StudyGuideRendererProps) {
  const sections = splitStudyGuide(content);

  if (sections.length === 0) {
    return null;
  }

  return (
    <ol className="study-guide-list">
      {sections.map((section, index) => (
        <li className="study-guide-item" key={`${index}-${section.slice(0, 24)}`}>
          {section.split(/\n+/).map((paragraph, paragraphIndex) => (
            <p key={`${index}-${paragraphIndex}`}>{paragraph}</p>
          ))}
        </li>
      ))}
    </ol>
  );
}
