import type { Request, Response } from "express";
import { z } from "zod";

import { saveGeneratedStudySet } from "../services/studySetStore.js";

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

  const created = await saveGeneratedStudySet(parsed.data);

  return response.status(201).json(created);
}
