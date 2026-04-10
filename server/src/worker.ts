import "dotenv/config";

import { Worker } from "bullmq";

import { env } from "./config/env.js";
import { logError, logInfo } from "./lib/logger.js";
import { createRedisConnection } from "./lib/redis.js";
import { studyGenerationQueue } from "./queue/studyGenerationQueue.js";
import { isGeminiRateLimitError } from "./services/geminiApi.js";
import { cacheStudyJob, cacheStudySetIdForHash, updateWorkerHeartbeat } from "./services/cacheService.js";
import { generateStudyMaterials } from "./services/geminiService.js";
import { publishStudyJobEvent } from "./services/jobEvents.js";
import { incrementMetric, observeDurationMetric } from "./services/metricsService.js";
import { readSourceDocument } from "./services/objectStorage.js";
import { extractPdfText } from "./services/pdfExtractionService.js";
import { ensurePgVectorInfrastructure, isPgVectorReady, queryNearestDocumentIds } from "./services/pgVectorService.js";
import {
  averageEmbeddings,
  chunkSemanticText,
  embedTextChunks,
  findBestSemanticCandidate,
  selectSemanticMatch,
  shouldRunSemanticCache,
  toGeneratedStudySetResponse
} from "./services/semanticCacheService.js";
import { createStudySet } from "./services/studySetRepository.js";
import { indexStudySetForSemanticCache } from "./services/studySetSemanticIndexService.js";
import {
  attachDocumentToStudySet,
  findSemanticCandidateDocuments,
  findSemanticCandidateDocumentsByIds,
  updateDocumentExtractedText,
  updateStudyJob
} from "./services/studyJobRepository.js";

type RankedDocument = Awaited<ReturnType<typeof queryNearestDocumentIds>>[number];
type SemanticCandidateDocument = Awaited<ReturnType<typeof findSemanticCandidateDocumentsByIds>>[number];
type SemanticCacheDocument = Awaited<ReturnType<typeof findSemanticCandidateDocuments>>[number];
type EmbeddedChunk = Awaited<ReturnType<typeof embedTextChunks>>[number];

async function setProgress(ownerId: string, jobId: string, stage: string, progressPercent: number) {
  const job = await updateStudyJob(ownerId, jobId, {
    status: "processing",
    stage,
    progressPercent
  });

  await cacheStudyJob(job);
  await publishStudyJobEvent({
    type: "study-job:progress",
    jobId,
    job
  });

  return job;
}

const worker = new Worker(
  env.STUDY_JOB_QUEUE_NAME,
  async (bullJob) => {
    const { jobId, ownerId, objectKey, fileName, mimeType, title, documentHash, sourceType, sourceText } = bullJob.data;
    const startedAt = Date.now();

    if (sourceType === "text") {
      const normalizedSourceText = sourceText?.trim();

      if (!normalizedSourceText || !documentHash) {
        throw new Error("Text study job is missing source text metadata.");
      }

      if (shouldRunSemanticCache(normalizedSourceText)) {
        await setProgress(ownerId, jobId, "checking-semantic-cache", 35);
        await ensurePgVectorInfrastructure();

        const queryChunks = chunkSemanticText(
          [
            `Title: ${title}`,
            "Source type: text",
            `Core content: ${normalizedSourceText}`
          ].join("\n")
        );

        if (queryChunks.length > 0) {
          const queryEmbeddings = await embedTextChunks(queryChunks);
          const queryVector = averageEmbeddings(queryEmbeddings.map((item: EmbeddedChunk) => item.embedding));
          let semanticMatch: ReturnType<typeof selectSemanticMatch> | ReturnType<typeof findBestSemanticCandidate> | null = null;

          if (isPgVectorReady()) {
            const rankedIds = await queryNearestDocumentIds("text", ownerId, queryVector, env.SEMANTIC_CACHE_CANDIDATE_LIMIT);
            const rankedCandidates = (await findSemanticCandidateDocumentsByIds(ownerId, rankedIds.map((item: RankedDocument) => item.id))).filter(
              (candidate: SemanticCandidateDocument) => candidate.hash !== documentHash
            );
            semanticMatch = selectSemanticMatch({
              title,
              candidates: rankedCandidates
                .map((candidate: SemanticCandidateDocument) => ({
                  similarity: rankedIds.find((item: RankedDocument) => item.id === candidate.documentId)?.similarity ?? 0,
                  candidate
                }))
                .filter((item: { similarity: number; candidate: SemanticCandidateDocument }) => item.similarity > 0)
            });
          } else {
            const candidates = await findSemanticCandidateDocuments(ownerId, "text", env.SEMANTIC_CACHE_CANDIDATE_LIMIT);
            semanticMatch = findBestSemanticCandidate({
              title,
              queryEmbeddings,
              candidates: candidates.filter((candidate: SemanticCacheDocument) => candidate.hash !== documentHash)
            });
          }

          if (semanticMatch) {
            const completedJob = await updateStudyJob(ownerId, jobId, {
              status: "completed",
              stage: "semantic-cache-hit",
              progressPercent: 100,
              cacheHit: true,
              generatedPayload: toGeneratedStudySetResponse(semanticMatch.candidate.studySet),
              completedAt: new Date(),
              errorCode: null,
              errorMessage: null
            });

            await incrementMetric("study_job_cache_hits_total");
            await cacheStudyJob(completedJob);
            await publishStudyJobEvent({
              type: "study-job:completed",
              jobId,
              job: completedJob
            });

            await incrementMetric("study_jobs_completed_total");
            await observeDurationMetric("study_job_processing_duration_ms", Date.now() - startedAt);

            return completedJob.id;
          }
        }
      }

      await setProgress(ownerId, jobId, "generating-study-pack", 60);
      const generated = await generateStudyMaterials({
        title,
        sourceType: "text",
        sourceText: normalizedSourceText
      });

      const completedJob = await updateStudyJob(ownerId, jobId, {
        status: "completed",
        stage: "completed",
        progressPercent: 100,
        generatedPayload: generated,
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null
      });

      await cacheStudyJob(completedJob);
      await publishStudyJobEvent({
        type: "study-job:completed",
        jobId,
        job: completedJob
      });

      await incrementMetric("study_jobs_completed_total");
      await observeDurationMetric("study_job_processing_duration_ms", Date.now() - startedAt);

      return completedJob.id;
    }

    await setProgress(ownerId, jobId, "downloading-source", 15);
    const pdfBuffer = await readSourceDocument(objectKey);

    await setProgress(ownerId, jobId, "extracting-text", 30);
    let extractedText: string;

    try {
      extractedText = await extractPdfText(pdfBuffer);
    } catch (error) {
      await incrementMetric("pdf_extraction_failures_total");
      throw error;
    }

    await updateDocumentExtractedText(documentHash, extractedText);

    if (shouldRunSemanticCache(extractedText)) {
      await setProgress(ownerId, jobId, "checking-semantic-cache", 45);
      await ensurePgVectorInfrastructure();

      const queryChunks = chunkSemanticText(
        [
          `Title: ${title}`,
          "Source type: pdf",
          `Core content: ${extractedText}`
        ].join("\n")
      );

      if (queryChunks.length > 0) {
        const queryEmbeddings = await embedTextChunks(queryChunks);
        const queryVector = averageEmbeddings(queryEmbeddings.map((item: EmbeddedChunk) => item.embedding));
        let semanticMatch: ReturnType<typeof selectSemanticMatch> | ReturnType<typeof findBestSemanticCandidate> | null = null;

        if (isPgVectorReady()) {
          const rankedIds = await queryNearestDocumentIds("pdf", ownerId, queryVector, env.SEMANTIC_CACHE_CANDIDATE_LIMIT);
          const rankedCandidates = (await findSemanticCandidateDocumentsByIds(ownerId, rankedIds.map((item: RankedDocument) => item.id))).filter(
            (candidate: SemanticCandidateDocument) => candidate.hash !== documentHash
          );
          semanticMatch = selectSemanticMatch({
            title,
            candidates: rankedCandidates
              .map((candidate: SemanticCandidateDocument) => ({
                similarity: rankedIds.find((item: RankedDocument) => item.id === candidate.documentId)?.similarity ?? 0,
                candidate
              }))
              .filter((item: { similarity: number; candidate: SemanticCandidateDocument }) => item.similarity > 0)
          });
        } else {
          const candidates = await findSemanticCandidateDocuments(ownerId, "pdf", env.SEMANTIC_CACHE_CANDIDATE_LIMIT);
          semanticMatch = findBestSemanticCandidate({
            title,
            queryEmbeddings,
            candidates: candidates.filter((candidate: SemanticCacheDocument) => candidate.hash !== documentHash)
          });
        }

        if (semanticMatch) {
          await incrementMetric("study_job_cache_hits_total");
          await cacheStudySetIdForHash(documentHash, semanticMatch.candidate.studySet.id);
          await attachDocumentToStudySet(documentHash, semanticMatch.candidate.studySet.id);

          const completedJob = await updateStudyJob(ownerId, jobId, {
            status: "completed",
            stage: "semantic-cache-hit",
            progressPercent: 100,
            cacheHit: true,
            studySetId: semanticMatch.candidate.studySet.id,
            completedAt: new Date(),
            errorCode: null,
            errorMessage: null
          });

          await cacheStudyJob(completedJob);
          await publishStudyJobEvent({
            type: "study-job:completed",
            jobId,
            job: completedJob,
            studySetId: semanticMatch.candidate.studySet.id
          });

          await incrementMetric("study_jobs_completed_total");
          await observeDurationMetric("study_job_processing_duration_ms", Date.now() - startedAt);

          return semanticMatch.candidate.studySet.id;
        }
      }
    }

    await setProgress(ownerId, jobId, "generating-study-pack", 60);
    const generated = await generateStudyMaterials({
      title,
      sourceType: "pdf",
      sourceFileName: fileName,
      extractedText,
      pdfFile: {
        buffer: pdfBuffer,
        mimeType,
        fileName
      }
    });

    await setProgress(ownerId, jobId, "persisting-study-pack", 88);
    const createdStudySet = await createStudySet({
      ownerId,
      title,
      sourceText: `Uploaded PDF: ${fileName}`,
      sourceType: "pdf",
      sourceFileName: fileName,
      generated
    });

    await attachDocumentToStudySet(documentHash, createdStudySet.id);
    await cacheStudySetIdForHash(documentHash, createdStudySet.id);

    const completedJob = await updateStudyJob(ownerId, jobId, {
      status: "completed",
      stage: "completed",
      progressPercent: 100,
      studySetId: createdStudySet.id,
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null
    });

    await cacheStudyJob(completedJob);
    await publishStudyJobEvent({
      type: "study-job:completed",
      jobId,
      job: completedJob,
      studySetId: createdStudySet.id
    });

    await incrementMetric("study_jobs_completed_total");
    await observeDurationMetric("study_job_processing_duration_ms", Date.now() - startedAt);

    void indexStudySetForSemanticCache(createdStudySet, {
      ownerId,
      documentHash,
      sourceFileName: fileName,
      extractedText
    }).catch((error) => {
      logError("Deferred semantic indexing failed for generated PDF study set", {
        studySetId: createdStudySet.id,
        jobId,
        error: error instanceof Error ? error.message : "Unknown semantic indexing error"
      });
    });

    return createdStudySet.id;
  },
  {
    connection: createRedisConnection(),
    prefix: env.REDIS_KEY_PREFIX,
    concurrency: env.STUDY_JOB_CONCURRENCY
  }
);

const heartbeatInterval = setInterval(() => {
  void updateWorkerHeartbeat({
    queue: env.STUDY_JOB_QUEUE_NAME,
    concurrency: env.STUDY_JOB_CONCURRENCY
  });
}, 5000);

worker.on("completed", (job) => {
  logInfo("Study job completed", {
    queueJobId: job?.id
  });
});

worker.on("error", (error) => {
  logError("Study worker runtime error", {
    error: error.message
  });
});

worker.on("failed", async (job, error) => {
  if (!job) {
    return;
  }

  const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
  const hasRetriesRemaining = job.attemptsMade < maxAttempts;

  if (hasRetriesRemaining) {
    const retryingJob = await updateStudyJob(job.data.ownerId, job.data.jobId, {
      status: "queued",
      stage: isGeminiRateLimitError(error) ? "waiting-for-rate-limit-retry" : "retrying",
      errorCode: isGeminiRateLimitError(error) ? "RATE_LIMITED" : "RETRYING",
      errorMessage: isGeminiRateLimitError(error)
        ? "Gemini is rate limiting requests. The job will retry automatically."
        : error.message,
      completedAt: null
    });

    await cacheStudyJob(retryingJob);
    await publishStudyJobEvent({
      type: "study-job:progress",
      jobId: job.data.jobId,
      job: retryingJob
    });

    logInfo("Study job scheduled for retry", {
      queueJobId: job.id,
      studyJobId: job.data.jobId,
      attemptsMade: job.attemptsMade,
      maxAttempts,
      rateLimited: isGeminiRateLimitError(error)
    });

    return;
  }

  await incrementMetric("study_jobs_failed_total");

  const failedJob = await updateStudyJob(job.data.ownerId, job.data.jobId, {
    status: "failed",
    stage: "failed",
    errorCode: isGeminiRateLimitError(error) ? "RATE_LIMITED" : "GENERATION_FAILED",
    errorMessage: isGeminiRateLimitError(error)
      ? "Gemini rate limits were hit repeatedly. Please try again after the quota window resets."
      : error.message,
    completedAt: new Date()
  });

  await cacheStudyJob(failedJob);
  await publishStudyJobEvent({
    type: "study-job:failed",
    jobId: job.data.jobId,
    job: failedJob,
    errorMessage: error.message
  });

  logError("Study job failed", {
    queueJobId: job.id,
    studyJobId: job.data.jobId,
    error: error.message,
    rateLimited: isGeminiRateLimitError(error)
  });
});

process.on("SIGTERM", async () => {
  clearInterval(heartbeatInterval);
  await worker.close();
  await studyGenerationQueue.close();
  process.exit(0);
});

void updateWorkerHeartbeat({
  queue: env.STUDY_JOB_QUEUE_NAME,
  concurrency: env.STUDY_JOB_CONCURRENCY
});

logInfo("Study worker started", {
  queue: env.STUDY_JOB_QUEUE_NAME,
  concurrency: env.STUDY_JOB_CONCURRENCY
});
