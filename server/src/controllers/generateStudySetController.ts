import type { Request, Response } from "express";
import { z } from "zod";

import { generateStudyMaterials } from "../services/geminiService.js";
import { GeminiApiError, isGeminiRateLimitError } from "../services/geminiApi.js";
import { incrementMetric } from "../services/metricsService.js";
import { env } from "../config/env.js";
import { ensurePgVectorInfrastructure, isPgVectorReady, queryNearestDocumentIds } from "../services/pgVectorService.js";
import { findStudySet } from "../services/studySetQueryService.js";
import {
  averageEmbeddings,
  buildTextDocumentHash,
  chunkSemanticText,
  embedTextChunks,
  findBestSemanticCandidate,
  normalizeSemanticText,
  selectSemanticMatch,
  shouldRunSemanticCache,
  toGeneratedStudySetResponse
} from "../services/semanticCacheService.js";
import { findDocumentByHashForOwner, findSemanticCandidateDocuments, findSemanticCandidateDocumentsByIds } from "../services/studyJobRepository.js";

export async function generateStudySetController(request: Request, response: Response) {
  const title = z.string().min(2).max(120).safeParse(request.body.title);

  if (!title.success) {
    return response.status(400).json({
      message: "Invalid study set payload.",
      issues: { fieldErrors: { title: ["Title must be between 2 and 120 characters."] } }
    });
  }

  try {
    const sourceText = z.string().trim().min(1).max(30000).safeParse(request.body.sourceText);

    if (!sourceText.success) {
      return response.status(400).json({
        message: "Invalid study set payload.",
        issues: { fieldErrors: { sourceText: ["Add a link or pasted text before generating."] } }
      });
    }

    const normalizedSourceText = normalizeSemanticText(sourceText.data);
    const ownerId = request.authUser!.id;
    const exactTextHash = buildTextDocumentHash(ownerId, normalizedSourceText);
    const exactDocument = await findDocumentByHashForOwner(ownerId, exactTextHash);

    if (exactDocument?.studySetId) {
      const cachedStudySet = await findStudySet(exactDocument.studySetId);

      if (cachedStudySet) {
        await incrementMetric("study_job_cache_hits_total");
        return response.status(200).json(toGeneratedStudySetResponse(cachedStudySet));
      }
    }

    if (shouldRunSemanticCache(normalizedSourceText)) {
      await ensurePgVectorInfrastructure();
      const queryChunks = chunkSemanticText(
        [
          `Title: ${title.data}`,
          `Source type: text`,
          `Core content: ${normalizedSourceText}`
        ].join("\n")
      );

      if (queryChunks.length > 0) {
        const queryEmbeddings = await embedTextChunks(queryChunks);
        const queryVector = averageEmbeddings(queryEmbeddings.map((item) => item.embedding));
        let semanticMatch: ReturnType<typeof selectSemanticMatch> | ReturnType<typeof findBestSemanticCandidate> | null = null;

        if (isPgVectorReady()) {
          const rankedIds = await queryNearestDocumentIds("text", ownerId, queryVector, env.SEMANTIC_CACHE_CANDIDATE_LIMIT);
          const rankedCandidates = await findSemanticCandidateDocumentsByIds(ownerId, rankedIds.map((item) => item.id));
          semanticMatch = selectSemanticMatch({
            title: title.data,
            candidates: rankedCandidates
              .map((candidate) => ({
                similarity: rankedIds.find((item) => item.id === candidate.documentId)?.similarity ?? 0,
                candidate
              }))
              .filter((item) => item.similarity > 0)
          });
        } else {
          const candidates = await findSemanticCandidateDocuments(ownerId, "text", env.SEMANTIC_CACHE_CANDIDATE_LIMIT);
          semanticMatch = findBestSemanticCandidate({
            title: title.data,
            queryEmbeddings,
            candidates
          });
        }

        if (semanticMatch) {
          await incrementMetric("study_job_cache_hits_total");
          return response.status(200).json(toGeneratedStudySetResponse(semanticMatch.candidate.studySet));
        }
      }
    }

    const studyPack = await generateStudyMaterials({
      title: title.data,
      sourceType: "text",
      sourceText: normalizedSourceText
    });

    return response.status(200).json(studyPack);
  } catch (error) {
    if (isGeminiRateLimitError(error)) {
      const retryAfterSeconds =
        error instanceof GeminiApiError && error.retryAfterMs ? Math.max(1, Math.ceil(error.retryAfterMs / 1000)) : undefined;

      if (retryAfterSeconds) {
        response.setHeader("Retry-After", String(retryAfterSeconds));
      }

      return response.status(429).json({
        message: retryAfterSeconds
          ? `Gemini is rate limiting requests right now. Try again in about ${retryAfterSeconds} seconds.`
          : "Gemini is rate limiting requests right now. Please try again shortly."
      });
    }

    return response.status(500).json({
      message: error instanceof Error ? error.message : "Study generation failed."
    });
  }
}
