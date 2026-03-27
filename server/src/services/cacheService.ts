import type { StudySetJob } from "@automated-study-system/shared";

import { redis } from "../lib/redis.js";

const DOCUMENT_HASH_PREFIX = "study-sphere:doc-hash:";
const STUDY_JOB_PREFIX = "study-sphere:job:";
const WORKER_HEARTBEAT_KEY = "study-sphere:worker-heartbeat";
const JOB_TTL_SECONDS = 60 * 30;
const DOCUMENT_TTL_SECONDS = 60 * 60 * 24;
const WORKER_HEARTBEAT_TTL_SECONDS = 20;

export async function getCachedStudySetIdForHash(documentHash: string) {
  return redis.get(`${DOCUMENT_HASH_PREFIX}${documentHash}`);
}

export async function cacheStudySetIdForHash(documentHash: string, studySetId: string) {
  await redis.set(`${DOCUMENT_HASH_PREFIX}${documentHash}`, studySetId, "EX", DOCUMENT_TTL_SECONDS);
}

export async function getCachedStudyJob(jobId: string) {
  const value = await redis.get(`${STUDY_JOB_PREFIX}${jobId}`);
  return value ? (JSON.parse(value) as StudySetJob) : null;
}

export async function cacheStudyJob(job: StudySetJob) {
  await redis.set(`${STUDY_JOB_PREFIX}${job.id}`, JSON.stringify(job), "EX", JOB_TTL_SECONDS);
}

export async function updateWorkerHeartbeat(metadata?: { queue?: string; concurrency?: number }) {
  await redis.set(
    WORKER_HEARTBEAT_KEY,
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      queue: metadata?.queue,
      concurrency: metadata?.concurrency
    }),
    "EX",
    WORKER_HEARTBEAT_TTL_SECONDS
  );
}

export async function getWorkerHeartbeat() {
  const value = await redis.get(WORKER_HEARTBEAT_KEY);
  return value ? (JSON.parse(value) as { updatedAt: string; queue?: string; concurrency?: number }) : null;
}
