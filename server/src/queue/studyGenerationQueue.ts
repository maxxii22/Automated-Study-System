import { Queue } from "bullmq";

import { env } from "../config/env.js";
import { createRedisConnection } from "../lib/redis.js";

export type StudyGenerationQueuePayload = {
  jobId: string;
  ownerId: string;
  title: string;
  sourceType: "text" | "pdf";
  sourceText?: string;
  documentHash?: string;
  objectKey?: string;
  fileName?: string;
  mimeType?: string;
};

export const studyGenerationQueue = new Queue<StudyGenerationQueuePayload>(env.STUDY_JOB_QUEUE_NAME, {
  connection: createRedisConnection(),
  prefix: env.REDIS_KEY_PREFIX,
  defaultJobOptions: {
    attempts: env.STUDY_JOB_MAX_ATTEMPTS,
    removeOnComplete: env.STUDY_JOB_RETENTION_COUNT,
    removeOnFail: env.STUDY_JOB_RETENTION_COUNT,
    backoff: {
      type: "exponential",
      delay: env.STUDY_JOB_BACKOFF_DELAY_MS
    }
  }
});

export async function getStudyQueueCounts() {
  return studyGenerationQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
}

export async function enqueueStudyGenerationJob(payload: StudyGenerationQueuePayload) {
  return studyGenerationQueue.add(payload.jobId, payload, {
    jobId: payload.jobId,
    priority: payload.sourceType === "text" ? 1 : 10
  });
}
