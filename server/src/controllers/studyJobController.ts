import type { Request, Response } from "express";
import { z } from "zod";

import { createPdfStudyJob, createTextStudyJob, getStudyJob, getStudyJobOpsSummary, recoverStaleStudyJobs, retryStudyJob } from "../services/studyJobService.js";

const createStudyJobSchema = z.discriminatedUnion("sourceType", [
  z.object({
    title: z.string().min(2).max(120),
    sourceType: z.literal("pdf")
  }),
  z.object({
    title: z.string().min(2).max(120),
    sourceType: z.literal("text"),
    sourceText: z.string().trim().min(1).max(30000)
  })
]);

export async function createStudyJobController(request: Request, response: Response) {
  const parsed = createStudyJobSchema.safeParse({
    title: request.body.title,
    sourceType: request.body.sourceType ?? (request.file ? "pdf" : "text"),
    sourceText: request.body.sourceText
  });

  if (!parsed.success) {
    return response.status(400).json({
      message: "Invalid study job payload.",
      issues: parsed.error.flatten()
    });
  }

  try {
    if (parsed.data.sourceType === "pdf") {
      if (!request.file) {
        return response.status(400).json({
          message: "A PDF file is required."
        });
      }

      const created = await createPdfStudyJob(request.authUser!.id, parsed.data, request.file);
      return response.status(202).json(created);
    }

    const created = await createTextStudyJob(request.authUser!.id, parsed.data);
    return response.status(202).json(created);
  } catch (error) {
    return response.status(500).json({
      message: error instanceof Error ? error.message : "Failed to queue study job."
    });
  }
}

export async function getStudyJobController(request: Request, response: Response) {
  const jobId = String(request.params.id);
  const job = await getStudyJob(request.authUser!.id, jobId);

  if (!job) {
    return response.status(404).json({ message: "Study job not found." });
  }

  return response.json({ job });
}

export async function getStudyJobOpsSummaryController(_request: Request, response: Response) {
  const summary = await getStudyJobOpsSummary(_request.authUser!.isAdmin, _request.authUser!.id);
  return response.json(summary);
}

export async function retryStudyJobController(request: Request, response: Response) {
  try {
    const retried = await retryStudyJob(request.authUser!.id, String(request.params.id));
    return response.json(retried);
  } catch (error) {
    return response.status(400).json({
      message: error instanceof Error ? error.message : "Failed to retry study job."
    });
  }
}

export async function recoverStaleStudyJobsController(_request: Request, response: Response) {
  const recovered = await recoverStaleStudyJobs(_request.authUser!.isAdmin, _request.authUser!.id);
  return response.json(recovered);
}
