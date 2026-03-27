import { redis } from "../lib/redis.js";
import { getStudyQueueCounts } from "../queue/studyGenerationQueue.js";
import { getWorkerHeartbeat } from "./cacheService.js";

const METRICS_HASH_KEY = "study-sphere:metrics:counters";

type CounterName =
  | "api_requests_total"
  | "api_request_errors_total"
  | "study_jobs_created_total"
  | "study_jobs_completed_total"
  | "study_jobs_failed_total"
  | "study_jobs_retried_total"
  | "study_jobs_recovered_total"
  | "study_job_cache_hits_total"
  | "gemini_requests_total"
  | "gemini_failures_total"
  | "gemini_rate_limits_total"
  | "pdf_extraction_failures_total";

type DurationName =
  | "api_request_duration_ms"
  | "gemini_request_duration_ms"
  | "study_job_processing_duration_ms";

function asCounterMetric(name: string, help: string, value: number) {
  return [`# HELP ${name} ${help}`, `# TYPE ${name} counter`, `${name} ${value}`].join("\n");
}

function asGaugeMetric(name: string, help: string, value: number) {
  return [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${value}`].join("\n");
}

export async function incrementMetric(name: CounterName, amount = 1) {
  await redis.hincrby(METRICS_HASH_KEY, name, amount);
}

export async function observeDurationMetric(name: DurationName, durationMs: number) {
  await redis
    .multi()
    .hincrbyfloat(METRICS_HASH_KEY, `${name}_sum`, durationMs)
    .hincrby(METRICS_HASH_KEY, `${name}_count`, 1)
    .exec();
}

async function readMetricsHash() {
  const values = await redis.hgetall(METRICS_HASH_KEY);
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      const parsed = Number(value);
      return [key, Number.isFinite(parsed) ? parsed : 0];
    })
  ) as Record<string, number>;
}

export async function renderPrometheusMetrics() {
  const [metrics, queueCounts, workerHeartbeat] = await Promise.all([
    readMetricsHash(),
    getStudyQueueCounts(),
    getWorkerHeartbeat()
  ]);

  const lines = [
    asCounterMetric("study_sphere_api_requests_total", "Total API requests handled.", metrics.api_requests_total ?? 0),
    asCounterMetric(
      "study_sphere_api_request_errors_total",
      "Total API requests that ended with an error status.",
      metrics.api_request_errors_total ?? 0
    ),
    asCounterMetric("study_sphere_study_jobs_created_total", "Total study jobs created.", metrics.study_jobs_created_total ?? 0),
    asCounterMetric(
      "study_sphere_study_jobs_completed_total",
      "Total study jobs completed successfully.",
      metrics.study_jobs_completed_total ?? 0
    ),
    asCounterMetric("study_sphere_study_jobs_failed_total", "Total study jobs that failed.", metrics.study_jobs_failed_total ?? 0),
    asCounterMetric("study_sphere_study_jobs_retried_total", "Total study job retries scheduled.", metrics.study_jobs_retried_total ?? 0),
    asCounterMetric(
      "study_sphere_study_jobs_recovered_total",
      "Total stale study jobs recovered by ops actions.",
      metrics.study_jobs_recovered_total ?? 0
    ),
    asCounterMetric(
      "study_sphere_study_job_cache_hits_total",
      "Total exact or semantic cache hits for study jobs and generation.",
      metrics.study_job_cache_hits_total ?? 0
    ),
    asCounterMetric("study_sphere_gemini_requests_total", "Total Gemini API requests made.", metrics.gemini_requests_total ?? 0),
    asCounterMetric("study_sphere_gemini_failures_total", "Total Gemini API request failures.", metrics.gemini_failures_total ?? 0),
    asCounterMetric("study_sphere_gemini_rate_limits_total", "Total Gemini API 429 responses.", metrics.gemini_rate_limits_total ?? 0),
    asCounterMetric(
      "study_sphere_pdf_extraction_failures_total",
      "Total PDF extraction failures encountered by the worker.",
      metrics.pdf_extraction_failures_total ?? 0
    ),
    asCounterMetric(
      "study_sphere_api_request_duration_ms_sum",
      "Total API request duration in milliseconds.",
      metrics.api_request_duration_ms_sum ?? 0
    ),
    asCounterMetric(
      "study_sphere_api_request_duration_ms_count",
      "Count of observed API request durations.",
      metrics.api_request_duration_ms_count ?? 0
    ),
    asCounterMetric(
      "study_sphere_gemini_request_duration_ms_sum",
      "Total Gemini request duration in milliseconds.",
      metrics.gemini_request_duration_ms_sum ?? 0
    ),
    asCounterMetric(
      "study_sphere_gemini_request_duration_ms_count",
      "Count of observed Gemini request durations.",
      metrics.gemini_request_duration_ms_count ?? 0
    ),
    asCounterMetric(
      "study_sphere_study_job_processing_duration_ms_sum",
      "Total study job processing time in milliseconds.",
      metrics.study_job_processing_duration_ms_sum ?? 0
    ),
    asCounterMetric(
      "study_sphere_study_job_processing_duration_ms_count",
      "Count of observed study job processing durations.",
      metrics.study_job_processing_duration_ms_count ?? 0
    ),
    asGaugeMetric("study_sphere_queue_waiting", "Current waiting jobs in the queue.", queueCounts.waiting ?? 0),
    asGaugeMetric("study_sphere_queue_active", "Current active jobs in the queue.", queueCounts.active ?? 0),
    asGaugeMetric("study_sphere_queue_completed", "Current completed jobs retained in the queue.", queueCounts.completed ?? 0),
    asGaugeMetric("study_sphere_queue_failed", "Current failed jobs retained in the queue.", queueCounts.failed ?? 0),
    asGaugeMetric("study_sphere_queue_delayed", "Current delayed jobs in the queue.", queueCounts.delayed ?? 0),
    asGaugeMetric(
      "study_sphere_worker_heartbeat_age_seconds",
      "Seconds since the worker heartbeat was last updated.",
      workerHeartbeat ? Math.max(0, Math.floor((Date.now() - Date.parse(workerHeartbeat.updatedAt)) / 1000)) : -1
    )
  ];

  return `${lines.join("\n")}\n`;
}
