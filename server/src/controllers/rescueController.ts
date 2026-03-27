import type { Request, Response } from "express";
import { z } from "zod";

import {
  createOrReuseRescueAttemptForSession,
  listRescueAttemptsForStudySet,
  submitRescueRetryForAttempt
} from "../services/rescueModeService.js";
import { getStudySet } from "../services/studySetRepository.js";

const createRescueAttemptSchema = z.object({
  examSessionId: z.string().min(1)
});

const submitRescueRetrySchema = z.object({
  userAnswer: z.string().trim().min(1).max(5000)
});

export async function listRescueAttemptsController(request: Request, response: Response) {
  const studySetId = String(request.params.id);
  const studySet = await getStudySet(request.authUser!.id, studySetId);

  if (!studySet) {
    return response.status(404).json({ message: "Study set not found." });
  }

  const examSessionId = z.string().optional().parse(request.query.examSessionId);
  const payload = await listRescueAttemptsForStudySet(request.authUser!.id, studySetId, examSessionId);
  return response.json(payload);
}

export async function createRescueAttemptController(request: Request, response: Response) {
  const studySetId = String(request.params.id);
  const studySet = await getStudySet(request.authUser!.id, studySetId);

  if (!studySet) {
    return response.status(404).json({ message: "Study set not found." });
  }

  const parsed = createRescueAttemptSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      message: "Invalid rescue request payload.",
      issues: parsed.error.flatten()
    });
  }

  try {
    const created = await createOrReuseRescueAttemptForSession(request.authUser!.id, studySetId, parsed.data.examSessionId);
    return response.status(201).json(created);
  } catch (error) {
    return response.status(400).json({
      message: error instanceof Error ? error.message : "Could not create rescue attempt."
    });
  }
}

export async function submitRescueRetryController(request: Request, response: Response) {
  const studySetId = String(request.params.id);
  const studySet = await getStudySet(request.authUser!.id, studySetId);

  if (!studySet) {
    return response.status(404).json({ message: "Study set not found." });
  }

  const parsed = submitRescueRetrySchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      message: "Invalid rescue retry payload.",
      issues: parsed.error.flatten()
    });
  }

  try {
    const result = await submitRescueRetryForAttempt(
      request.authUser!.id,
      studySetId,
      String(request.params.rescueId),
      parsed.data.userAnswer
    );
    return response.json(result);
  } catch (error) {
    return response.status(400).json({
      message: error instanceof Error ? error.message : "Could not submit rescue retry."
    });
  }
}
