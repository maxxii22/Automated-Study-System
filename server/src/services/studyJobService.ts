import { createHash } from "node:crypto";

import type {
  CreateStudyJobRequest,
  CreateStudyJobResponse,
  GenerateStudySetResponse,
  RecoverStudyJobsResponse,
  RetryStudyJobResponse,
  StudyJobOpsSummaryResponse,
  StudySetJob
} from "@automated-study-system/shared";

import { env } from "../config/env.js";
import { cacheStudyJob, cacheStudySetIdForHash, getCachedStudySetIdForHash, getWorkerHeartbeat } from "./cacheService.js";
import { publishStudyJobEvent } from "./jobEvents.js";
import { incrementMetric } from "./metricsService.js";
import { storeSourceDocument } from "./objectStorage.js";
import { enqueueStudyGenerationJob, getStudyQueueCounts } from "../queue/studyGenerationQueue.js";
import { findStudySet } from "./studySetQueryService.js";
import { buildTextDocumentHash, normalizeSemanticText, toGeneratedStudySetResponse } from "./semanticCacheService.js";
import {
  createStudyJob,
  ensureDocumentOwner,
  findCompletedStudyJobByHash,
  findActiveStudyJobByHash,
  findDocumentByHash,
  findDocumentByHashForOwner,
  findStudyJob,
  listRecoverableStaleStudyJobs,
  listStaleProcessingStudyJobsAcrossOwners,
  listStudyJobsByStatusAcrossOwners,
  listStaleProcessingStudyJobs,
  listStudyJobsByStatus,
  updateStudyJob,
  upsertDocumentRecord
} from "./studyJobRepository.js";
import { cloneStudySetToOwner } from "./studySetRepository.js";

function hashBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertRetryablePdfJob(
  job: StudySetJob
): asserts job is StudySetJob & {
  sourceType: "pdf";
  documentHash: string;
  sourceObjectKey: string;
  sourceFileName: string;
} {
  if (job.sourceType !== "pdf") {
    throw new Error("Only PDF study jobs can be retried from the queue.");
  }

  if (!job.documentHash || !job.sourceObjectKey || !job.sourceFileName) {
    throw new Error("Study job is missing source document metadata and cannot be requeued.");
  }
}

function assertRetryableTextJob(
  job: StudySetJob
): asserts job is StudySetJob & {
  sourceType: "text";
  documentHash: string;
} {
  if (job.sourceType !== "text") {
    throw new Error("Only text study jobs can be retried with inline document metadata.");
  }

  if (!job.documentHash) {
    throw new Error("Study job is missing text document metadata and cannot be requeued.");
  }
}

async function queuePdfStudyJob(ownerId: string, job: StudySetJob, title: string) {
  assertRetryablePdfJob(job);
  const documentHash = job.documentHash;
  const objectKey = job.sourceObjectKey;
  const fileName = job.sourceFileName;

  await enqueueStudyGenerationJob({
    jobId: job.id,
    ownerId,
    title,
    sourceType: "pdf",
    documentHash,
    objectKey,
    fileName,
    mimeType: "application/pdf"
  });
}

async function queueTextStudyJob(ownerId: string, job: StudySetJob, title: string) {
  assertRetryableTextJob(job);
  const document = await findDocumentByHashForOwner(ownerId, job.documentHash);

  if (!document?.extractedText?.trim()) {
    throw new Error("Text study job is missing extracted text and cannot be requeued.");
  }

  await enqueueStudyGenerationJob({
    jobId: job.id,
    ownerId,
    title,
    sourceType: "text",
    sourceText: document.extractedText,
    documentHash: job.documentHash
  });
}

async function queueStudyJob(ownerId: string, job: StudySetJob, title: string) {
  if (job.sourceType === "pdf") {
    await queuePdfStudyJob(ownerId, job, title);
    return;
  }

  await queueTextStudyJob(ownerId, job, title);
}

async function completeTextStudyJobFromGeneratedPayload(
  ownerId: string,
  title: string,
  sourceText: string,
  documentHash: string,
  generatedPayload: GenerateStudySetResponse,
  cacheHit = false,
  stage = "completed"
) {
  const completedJob = await createStudyJob({
    ownerId,
    title,
    sourceType: "text",
    sourceText,
    documentHash,
    status: "completed",
    cacheHit,
    stage,
    progressPercent: 100,
    generatedPayload
  });

  await cacheStudyJob(completedJob);
  await publishStudyJobEvent({
    type: "study-job:completed",
    jobId: completedJob.id,
    job: completedJob
  });

  return completedJob;
}

export async function createPdfStudyJob(
  ownerId: string,
  payload: Extract<CreateStudyJobRequest, { sourceType: "pdf" }>,
  sourceFile: Express.Multer.File
): Promise<CreateStudyJobResponse> {
  const documentHash = hashBuffer(sourceFile.buffer);
  const activeJob = await findActiveStudyJobByHash(ownerId, documentHash);

  if (activeJob) {
    await cacheStudyJob(activeJob);
    return { job: activeJob };
  }

  const completedOwnedJob = await findCompletedStudyJobByHash(ownerId, documentHash);

  if (completedOwnedJob?.studySetId) {
    await cacheStudyJob(completedOwnedJob);
    return { job: completedOwnedJob };
  }

  const existingDocument = await findDocumentByHash(documentHash);
  const cachedStudySetId = (await getCachedStudySetIdForHash(documentHash)) ?? existingDocument?.studySetId ?? null;

  if (cachedStudySetId) {
    const cachedStudySet = await findStudySet(cachedStudySetId);

    if (cachedStudySet) {
      await incrementMetric("study_job_cache_hits_total");
      const ownedStudySet = await cloneStudySetToOwner(cachedStudySet.id, ownerId);

      if (!ownedStudySet) {
        throw new Error("Cached study set could not be copied for this user.");
      }

      const completedJob = await createStudyJob({
        ownerId,
        title: payload.title,
        sourceType: "pdf",
        sourceFileName: sourceFile.originalname,
        sourceObjectKey: existingDocument?.sourceObjectKey ?? "cache-hit",
        documentHash,
        status: "completed",
        cacheHit: true,
        stage: "cache-hit",
        progressPercent: 100,
        studySetId: ownedStudySet.id
      });

      if (existingDocument) {
        await ensureDocumentOwner(existingDocument.id, ownerId);
      }

      await cacheStudySetIdForHash(documentHash, cachedStudySet.id);
      await cacheStudyJob(completedJob);
      await publishStudyJobEvent({
        type: "study-job:completed",
        jobId: completedJob.id,
        job: completedJob,
        studySetId: ownedStudySet.id
      });

      return { job: completedJob };
    }
  }

  const storedObject = await storeSourceDocument({
    buffer: sourceFile.buffer,
    fileName: sourceFile.originalname,
    mimeType: sourceFile.mimetype
  });

  await upsertDocumentRecord({
    hash: documentHash,
    sourceFileName: sourceFile.originalname,
    sourceObjectKey: storedObject.objectKey,
    mimeType: sourceFile.mimetype,
    byteSize: sourceFile.size
  });
  const document = await findDocumentByHash(documentHash);

  if (!document) {
    throw new Error("Stored document metadata could not be loaded.");
  }

  await ensureDocumentOwner(document.id, ownerId);

  const queuedJob = await createStudyJob({
    ownerId,
    title: payload.title,
    sourceType: "pdf",
    sourceFileName: sourceFile.originalname,
    sourceObjectKey: storedObject.objectKey,
    documentHash,
    status: "queued",
    stage: "uploaded",
    progressPercent: 5
  });

  await cacheStudyJob(queuedJob);
  await incrementMetric("study_jobs_created_total");
  await publishStudyJobEvent({
    type: "study-job:queued",
    jobId: queuedJob.id,
    job: queuedJob
  });

  await enqueueStudyGenerationJob({
    jobId: queuedJob.id,
    ownerId,
    title: payload.title,
    sourceType: "pdf",
    documentHash,
    objectKey: storedObject.objectKey,
    fileName: sourceFile.originalname,
    mimeType: sourceFile.mimetype
  });

  return { job: queuedJob };
}

export async function createTextStudyJob(
  ownerId: string,
  payload: Extract<CreateStudyJobRequest, { sourceType: "text" }>
): Promise<CreateStudyJobResponse> {
  const normalizedSourceText = normalizeSemanticText(payload.sourceText);
  const documentHash = buildTextDocumentHash(ownerId, normalizedSourceText);
  const activeJob = await findActiveStudyJobByHash(ownerId, documentHash);

  if (activeJob) {
    await cacheStudyJob(activeJob);
    return { job: activeJob };
  }

  const completedOwnedJob = await findCompletedStudyJobByHash(ownerId, documentHash);

  if (completedOwnedJob?.generatedStudySet) {
    await cacheStudyJob(completedOwnedJob);
    return { job: completedOwnedJob };
  }

  const exactDocument = await findDocumentByHashForOwner(ownerId, documentHash);

  if (exactDocument?.studySetId) {
    const cachedStudySet = await findStudySet(exactDocument.studySetId);

    if (cachedStudySet) {
      await incrementMetric("study_job_cache_hits_total");
      const completedJob = await completeTextStudyJobFromGeneratedPayload(
        ownerId,
        payload.title,
        normalizedSourceText,
        documentHash,
        toGeneratedStudySetResponse(cachedStudySet),
        true,
        "cache-hit"
      );

      return { job: completedJob };
    }
  }

  const sourceObjectKey = `inline:text:${documentHash}`;
  const existingDocument = await findDocumentByHash(documentHash);

  if (!existingDocument) {
    await upsertDocumentRecord({
      hash: documentHash,
      sourceObjectKey,
      mimeType: "text/plain",
      byteSize: Buffer.byteLength(normalizedSourceText, "utf8"),
      extractedText: normalizedSourceText
    });
  }

  const document = await findDocumentByHash(documentHash);

  if (!document) {
    throw new Error("Text document metadata could not be created.");
  }

  await ensureDocumentOwner(document.id, ownerId);

  const queuedJob = await createStudyJob({
    ownerId,
    title: payload.title,
    sourceType: "text",
    sourceText: normalizedSourceText,
    documentHash,
    sourceObjectKey,
    status: "queued",
    stage: "queued",
    progressPercent: 5
  });

  await cacheStudyJob(queuedJob);
  await incrementMetric("study_jobs_created_total");
  await publishStudyJobEvent({
    type: "study-job:queued",
    jobId: queuedJob.id,
    job: queuedJob
  });

  await enqueueStudyGenerationJob({
    jobId: queuedJob.id,
    ownerId,
    title: payload.title,
    sourceType: "text",
    sourceText: normalizedSourceText,
    documentHash
  });

  return { job: queuedJob };
}

export async function getStudyJob(ownerId: string, jobId: string) {
  return findStudyJob(ownerId, jobId);
}

export async function getStudyJobOpsSummary(isAdmin: boolean, ownerId?: string): Promise<StudyJobOpsSummaryResponse> {
  const staleBefore = new Date(Date.now() - env.STUDY_JOB_STALE_AFTER_MS);
  const [workerHeartbeat, queue, recentFailedJobs, stalledJobs] = await Promise.all([
    getWorkerHeartbeat(),
    getStudyQueueCounts(),
    isAdmin ? listStudyJobsByStatusAcrossOwners(["failed"], 10) : listStudyJobsByStatus(ownerId!, ["failed"], 10),
    isAdmin ? listStaleProcessingStudyJobsAcrossOwners(staleBefore, 20) : listStaleProcessingStudyJobs(ownerId!, staleBefore, 20)
  ]);

  return {
    workerHealthy: Boolean(workerHeartbeat),
    staleThresholdMs: env.STUDY_JOB_STALE_AFTER_MS,
    queue: {
      waiting: queue.waiting ?? 0,
      active: queue.active ?? 0,
      completed: queue.completed ?? 0,
      failed: queue.failed ?? 0,
      delayed: queue.delayed ?? 0
    },
    recentFailedJobs,
    stalledJobs
  };
}

export async function retryStudyJob(ownerId: string, jobId: string): Promise<RetryStudyJobResponse> {
  const job = await findStudyJob(ownerId, jobId);

  if (!job) {
    throw new Error("Study job not found.");
  }

  if (job.status === "completed") {
    throw new Error("Completed study jobs do not need to be retried.");
  }

  const requeuedJob = await updateStudyJob(ownerId, job.id, {
    status: "queued",
    stage: "manual-retry-queued",
    progressPercent: 5,
    errorCode: null,
    errorMessage: null,
    completedAt: null
  });

  await cacheStudyJob(requeuedJob);
  await incrementMetric("study_jobs_retried_total");
  await publishStudyJobEvent({
    type: "study-job:progress",
    jobId: requeuedJob.id,
    job: requeuedJob
  });

  await queueStudyJob(ownerId, requeuedJob, job.title);

  return {
    job: requeuedJob,
    requeued: true
  };
}

export async function recoverStaleStudyJobs(isAdmin: boolean, ownerId?: string): Promise<RecoverStudyJobsResponse> {
  const staleBefore = new Date(Date.now() - env.STUDY_JOB_STALE_AFTER_MS);
  const staleJobs = isAdmin
    ? await listRecoverableStaleStudyJobs(staleBefore, 20)
    : (await listStaleProcessingStudyJobs(ownerId!, staleBefore, 20)).map((job: StudySetJob) => ({ id: job.id, ownerId: ownerId! }));
  const recovered: StudySetJob[] = [];

  for (const staleJob of staleJobs) {
    if (!staleJob.ownerId) {
      continue;
    }

    try {
      const retried = await retryStudyJob(staleJob.ownerId, staleJob.id);
      recovered.push(retried.job);
      await incrementMetric("study_jobs_recovered_total");
    } catch {
      // Ignore individual recovery failures so one bad record does not block the batch.
    }
  }

  return {
    recoveredCount: recovered.length,
    jobs: recovered
  };
}
