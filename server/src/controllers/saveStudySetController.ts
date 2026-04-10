import type { Request, Response } from "express";
import { z } from "zod";

import { logError } from "../lib/logger.js";
import { createStudySet } from "../services/studySetRepository.js";
import { indexStudySetForSemanticCache } from "../services/studySetSemanticIndexService.js";

const flashcardSchema = z.object({
  question: z.string().min(3),
  answer: z.string().min(1),
  order: z.number().int().nonnegative()
});

const saveStudySetSchema = z.object({
  title: z.string().min(2).max(120),
  sourceText: z.string().min(1).max(30000),
  sourceType: z.enum(["text", "pdf"]),
  sourceFileName: z.string().min(1).max(255).optional(),
  summary: z.string().min(10),
  studyGuide: z.string().min(10),
  keyConcepts: z.array(z.string().min(1)).min(1),
  flashcards: z.array(flashcardSchema).min(1)
});

export async function saveStudySetController(request: Request, response: Response) {
  const parsed = saveStudySetSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      message: "Invalid study set payload.",
      issues: parsed.error.flatten()
    });
  }

  const created = await createStudySet({
    ownerId: request.authUser!.id,
    title: parsed.data.title,
    sourceText: parsed.data.sourceText,
    sourceType: parsed.data.sourceType,
    sourceFileName: parsed.data.sourceFileName,
    generated: {
      title: parsed.data.title,
      summary: parsed.data.summary,
      studyGuide: parsed.data.studyGuide,
      keyConcepts: parsed.data.keyConcepts,
      flashcards: parsed.data.flashcards
    }
  });

  void indexStudySetForSemanticCache(created, {
    ownerId: request.authUser!.id
  }).catch((error) => {
    logError("Study set semantic indexing failed after save", {
      studySetId: created.id,
      error: error instanceof Error ? error.message : "Unknown semantic indexing error"
    });
  });

  return response.status(201).json(created);
}
