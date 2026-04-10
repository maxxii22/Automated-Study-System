import type { Request, Response } from "express";
import { z } from "zod";

import { logInfo } from "../lib/logger.js";
import { generateStudyMaterials } from "../services/geminiService.js";
import { GeminiApiError, isGeminiRateLimitError } from "../services/geminiApi.js";
import { incrementMetric } from "../services/metricsService.js";
import { findStudySet } from "../services/studySetQueryService.js";
import {
  buildTextDocumentHash,
  findSemanticCacheMatch,
  normalizeSemanticText,
  shouldRunSemanticCache,
  toGeneratedStudySetResponse
} from "../services/semanticCacheService.js";
import { findDocumentByHashForOwner } from "../services/studyJobRepository.js";

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
      try {
        const semanticMatch = await findSemanticCacheMatch({
          ownerId,
          title: title.data,
          sourceType: "text",
          sourceText: normalizedSourceText,
          excludedDocumentHash: exactTextHash
        });

        if (semanticMatch) {
          await incrementMetric("study_job_cache_hits_total");
          return response.status(200).json(toGeneratedStudySetResponse(semanticMatch.candidate.studySet));
        }
      } catch (error) {
        logInfo("Semantic cache lookup skipped during direct study generation", {
          ownerId,
          sourceType: "text",
          reason: error instanceof Error ? error.message : "Unknown semantic cache lookup error"
        });
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
