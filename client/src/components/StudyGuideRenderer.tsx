import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

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
    return <p className="text-sm text-zinc-400">No study guide sections matched this key concept yet.</p>;
  }

  return (
    <div className="space-y-4">
      {guideSections.map((section, index) => {
        const isOpen = openSections[section.id] ?? false;
        const buttonId = `${section.id}-button`;
        const contentId = `${section.id}-content`;

        return (
          <article
            className={cn(
              "overflow-hidden rounded-[1.5rem] border shadow-[0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-colors",
              section.tone === "focus"
                ? "border-white/12 bg-white/[0.05]"
                : "border-white/8 bg-white/[0.03]"
            )}
            key={section.id}
          >
            <button
              aria-controls={contentId}
              aria-expanded={isOpen}
              className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left transition hover:bg-white/[0.03]"
              id={buttonId}
              onClick={() =>
                setOpenSections((current) => ({
                  ...current,
                  [section.id]: !current[section.id]
                }))
              }
              type="button"
            >
              <span className="space-y-2">
                <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">
                  Section {index + 1}
                </span>
                <span className="block font-[family-name:var(--font-display)] text-xl leading-tight text-white">
                  {section.title}
                </span>
              </span>
              <span className="mt-1 text-lg text-zinc-400">{isOpen ? "−" : "+"}</span>
            </button>

            {isOpen ? (
              <div
                aria-labelledby={buttonId}
                className="space-y-4 border-t border-white/8 px-5 py-5"
                id={contentId}
                role="region"
              >
                {section.keyIdea ? (
                  <div className="rounded-[1.25rem] border border-white/8 bg-black/20 p-4">
                    <span className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-zinc-500">Key idea</span>
                    <p className="mt-3 text-sm leading-7 text-zinc-300">{section.keyIdea}</p>
                  </div>
                ) : null}

                {section.points.length > 0 ? (
                  <div className="rounded-[1.25rem] border border-white/8 bg-black/20 p-4">
                    <span className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-zinc-500">Key points</span>
                    <ul className="mt-3 space-y-3 pl-5 text-sm leading-7 text-zinc-300">
                      {section.points.map((point) => (
                        <li key={`${section.id}-${point.slice(0, 24)}`}>{point}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {section.examFocus ? (
                  <div className="rounded-[1.25rem] border border-amber-300/12 bg-[linear-gradient(180deg,rgba(255,184,108,0.08),rgba(255,184,108,0.02))] p-4">
                    <span className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-amber-100/75">
                      Exam focus
                    </span>
                    <p className="mt-3 text-sm leading-7 text-zinc-200">{section.examFocus}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
