import { createHash } from "node:crypto";

import type { GenerateStudySetResponse, StudySet } from "@automated-study-system/shared";

import { env } from "../config/env.js";
import { fetchGeminiJson } from "./geminiApi.js";

type EmbeddingRecord = {
  chunkIndex: number;
  content: string;
  embedding: number[];
};

type SemanticCandidate = {
  documentId: string;
  hash: string;
  sourceText: string;
  sourceType: "text" | "pdf";
  studySet: StudySet;
  embeddings: EmbeddingRecord[];
};

const TITLE_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "your",
  "that",
  "this",
  "notes",
  "study",
  "guide",
  "introduction"
]);

export function averageEmbeddings(vectors: number[][]) {
  if (vectors.length === 0) {
    return [];
  }

  const dimension = vectors[0]?.length ?? 0;
  const accumulator = new Array<number>(dimension).fill(0);

  vectors.forEach((vector) => {
    for (let index = 0; index < dimension; index += 1) {
      accumulator[index] += vector[index] ?? 0;
    }
  });

  return accumulator.map((value) => value / vectors.length);
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function tokenizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !TITLE_STOP_WORDS.has(token));
}

export function titleOverlapScore(leftTitle: string, rightTitle: string) {
  const leftTokens = tokenizeTitle(leftTitle);
  const rightTokens = new Set(tokenizeTitle(rightTitle));

  if (leftTokens.length === 0 || rightTokens.size === 0) {
    return 0;
  }

  const overlap = leftTokens.filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.length, 1);
}

function extractEmbeddingValues(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => typeof item === "number");
}

function buildEmbedRequestPayload(text: string) {
  return {
    model: `models/${env.GEMINI_EMBEDDING_MODEL}`,
    content: {
      parts: [{ text }]
    },
    taskType: "SEMANTIC_SIMILARITY",
    outputDimensionality: env.GEMINI_EMBEDDING_DIMENSIONALITY
  };
}

export function normalizeSemanticText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

export function shouldRunSemanticCache(text: string) {
  if (!env.SEMANTIC_CACHE_ENABLED) {
    return false;
  }

  const normalized = normalizeSemanticText(text);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  return normalized.length >= env.SEMANTIC_CACHE_MIN_TEXT_LENGTH && wordCount >= env.SEMANTIC_CACHE_MIN_WORD_COUNT;
}

export function buildTextDocumentHash(ownerId: string, sourceText: string) {
  return `text:${ownerId}:${createHash("sha256").update(normalizeSemanticText(sourceText)).digest("hex")}`;
}

export function buildStudySetSemanticSource(studySet: Pick<StudySet, "title" | "sourceType" | "sourceText" | "summary" | "studyGuide" | "keyConcepts">) {
  const sourceExcerpt =
    studySet.sourceType === "text"
      ? normalizeSemanticText(studySet.sourceText).slice(0, 4000)
      : normalizeSemanticText(`${studySet.summary}\n\n${studySet.studyGuide}`);

  return normalizeSemanticText(
    [
      `Title: ${studySet.title}`,
      `Source type: ${studySet.sourceType}`,
      `Key concepts: ${studySet.keyConcepts.join(", ")}`,
      `Core content: ${sourceExcerpt}`
    ].join("\n")
  );
}

export function toGeneratedStudySetResponse(studySet: StudySet): GenerateStudySetResponse {
  return {
    title: studySet.title,
    summary: studySet.summary,
    studyGuide: studySet.studyGuide,
    keyConcepts: studySet.keyConcepts,
    flashcards: studySet.flashcards.map((card) => ({
      question: card.question,
      answer: card.answer,
      order: card.order
    }))
  };
}

export function chunkSemanticText(text: string, targetLength = 1200) {
  const normalized = normalizeSemanticText(text);

  if (!normalized) {
    return [];
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const candidate = currentChunk ? `${currentChunk} ${sentence}` : sentence;

    if (candidate.length > targetLength && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
      continue;
    }

    currentChunk = candidate;
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.slice(0, 8);
}

export async function embedTextChunks(chunks: string[]) {
  if (chunks.length === 0) {
    return [] as EmbeddingRecord[];
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Add it to server/.env before using semantic caching.");
  }

  const responses = await Promise.all(
    chunks.map(async (chunk, index) => {
      const data = await fetchGeminiJson<{
        embedding?: { values?: number[] };
        embeddings?: Array<{ values?: number[] }>;
      }>({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        body: buildEmbedRequestPayload(chunk),
        action: "Gemini embeddings request"
      });

      const values = extractEmbeddingValues(data.embedding?.values ?? data.embeddings?.[0]?.values);

      if (values.length === 0) {
        throw new Error("Gemini returned an empty embedding vector.");
      }

      return {
        chunkIndex: index,
        content: chunk,
        embedding: values
      };
    })
  );

  return responses;
}

export function findBestSemanticCandidate(input: {
  title: string;
  queryEmbeddings: EmbeddingRecord[];
  candidates: SemanticCandidate[];
}) {
  const queryVector = averageEmbeddings(input.queryEmbeddings.map((item) => item.embedding));
  let bestMatch:
    | {
        similarity: number;
        titleOverlap: number;
        candidate: SemanticCandidate;
      }
    | undefined;

  input.candidates.forEach((candidate) => {
    const candidateVector = averageEmbeddings(candidate.embeddings.map((item) => item.embedding));
    const similarity = cosineSimilarity(queryVector, candidateVector);
    const overlap = titleOverlapScore(input.title, candidate.studySet.title);

    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = {
        similarity,
        titleOverlap: overlap,
        candidate
      };
    }
  });

  if (!bestMatch) {
    return null;
  }

  const threshold = env.SEMANTIC_CACHE_THRESHOLD;
  const passes =
    bestMatch.similarity >= threshold || (bestMatch.similarity >= threshold - 0.04 && bestMatch.titleOverlap >= 0.34);

  return passes ? bestMatch : null;
}

export function selectSemanticMatch(input: {
  title: string;
  candidates: Array<{
    similarity: number;
    candidate: SemanticCandidate;
  }>;
}) {
  let bestMatch:
    | {
        similarity: number;
        titleOverlap: number;
        candidate: SemanticCandidate;
      }
    | undefined;

  input.candidates.forEach(({ similarity, candidate }) => {
    const overlap = titleOverlapScore(input.title, candidate.studySet.title);

    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = {
        similarity,
        titleOverlap: overlap,
        candidate
      };
    }
  });

  if (!bestMatch) {
    return null;
  }

  const threshold = env.SEMANTIC_CACHE_THRESHOLD;
  const passes =
    bestMatch.similarity >= threshold || (bestMatch.similarity >= threshold - 0.04 && bestMatch.titleOverlap >= 0.34);

  return passes ? bestMatch : null;
}
