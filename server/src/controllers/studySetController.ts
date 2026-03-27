import type { Request, Response } from "express";

import { z } from "zod";

import { deleteStudySet, getStudySet, listFlashcards, listStudySets } from "../services/studySetRepository.js";

export async function listStudySetsController(request: Request, response: Response) {
  const cursor = z.string().optional().parse(request.query.cursor);
  const limit = z.coerce.number().int().positive().max(25).optional().parse(request.query.limit);
  const studySets = await listStudySets(request.authUser!.id, cursor, limit);
  response.json(studySets);
}

export async function getStudySetController(request: Request, response: Response) {
  const studySetId = String(request.params.id);
  const studySet = await getStudySet(request.authUser!.id, studySetId);

  if (!studySet) {
    return response.status(404).json({ message: "Study set not found." });
  }

  return response.json(studySet);
}

export async function listStudySetFlashcardsController(request: Request, response: Response) {
  const studySetId = String(request.params.id);
  const cursor = z.string().optional().parse(request.query.cursor);
  const limit = z.coerce.number().int().positive().max(25).optional().parse(request.query.limit);

  const studySet = await getStudySet(request.authUser!.id, studySetId);

  if (!studySet) {
    return response.status(404).json({ message: "Study set not found." });
  }

  const flashcards = await listFlashcards(request.authUser!.id, studySetId, cursor, limit);
  return response.json(flashcards);
}

export async function deleteStudySetController(request: Request, response: Response) {
  const studySetId = String(request.params.id);

  try {
    await deleteStudySet(request.authUser!.id, studySetId);
    return response.status(204).send();
  } catch {
    return response.status(404).json({ message: "Study set not found." });
  }
}
