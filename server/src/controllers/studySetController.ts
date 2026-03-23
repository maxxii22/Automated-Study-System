import type { Request, Response } from "express";

import { getStoredStudySet, listStoredStudySets } from "../services/studySetStore.js";

export async function listStudySetsController(_request: Request, response: Response) {
  const studySets = await listStoredStudySets();
  response.json(studySets);
}

export async function getStudySetController(request: Request, response: Response) {
  const studySetId = String(request.params.id);
  const studySet = await getStoredStudySet(studySetId);

  if (!studySet) {
    return response.status(404).json({ message: "Study set not found." });
  }

  return response.json(studySet);
}
