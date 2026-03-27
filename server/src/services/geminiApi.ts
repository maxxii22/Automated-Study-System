import { env } from "../config/env.js";
import { incrementMetric, observeDurationMetric } from "./metricsService.js";

type GeminiApiErrorInput = {
  action: string;
  status: number;
  responseText: string;
  retryAfterMs?: number;
};

type GeminiRequestPriority = "high" | "normal";

type QueuedTask = {
  priority: GeminiRequestPriority;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

let activeGeminiRequests = 0;
const pendingGeminiRequests: QueuedTask[] = [];
let geminiCooldownUntil = 0;
const PRIORITY_COOLDOWN_WAIT_MAX_MS = 15_000;

export class GeminiApiError extends Error {
  readonly action: string;
  readonly status: number;
  readonly responseText: string;
  readonly retryAfterMs?: number;

  constructor(input: GeminiApiErrorInput) {
    const retryMessage = input.retryAfterMs ? ` Retry after about ${Math.ceil(input.retryAfterMs / 1000)}s.` : "";
    super(`${input.action} failed: ${input.status} ${input.responseText}${retryMessage}`);
    this.name = "GeminiApiError";
    this.action = input.action;
    this.status = input.status;
    this.responseText = input.responseText;
    this.retryAfterMs = input.retryAfterMs;
  }
}

function parseRetryAfterHeader(value: string | null) {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  const dateValue = Date.parse(value);
  if (Number.isFinite(dateValue)) {
    const delta = dateValue - Date.now();
    return delta > 0 ? delta : undefined;
  }

  return undefined;
}

function releaseGeminiSlot() {
  activeGeminiRequests = Math.max(0, activeGeminiRequests - 1);
  const nextTask = pendingGeminiRequests.shift();

  if (!nextTask) {
    return;
  }

  activeGeminiRequests += 1;
  void nextTask
    .run()
    .then(nextTask.resolve)
    .catch(nextTask.reject)
    .finally(releaseGeminiSlot);
}

function enqueueGeminiTask(task: QueuedTask) {
  if (task.priority === "high") {
    const firstNormalTaskIndex = pendingGeminiRequests.findIndex((pendingTask) => pendingTask.priority !== "high");

    if (firstNormalTaskIndex === -1) {
      pendingGeminiRequests.push(task);
      return;
    }

    pendingGeminiRequests.splice(firstNormalTaskIndex, 0, task);
    return;
  }

  pendingGeminiRequests.push(task);
}

function sleep(durationMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function waitForGeminiCooldownIfAllowed(action: string, priority: GeminiRequestPriority) {
  const retryAfterMs = geminiCooldownUntil - Date.now();

  if (retryAfterMs <= 0) {
    return;
  }

  if (priority === "high" && retryAfterMs <= PRIORITY_COOLDOWN_WAIT_MAX_MS) {
    await sleep(retryAfterMs);
    return;
  }

  await incrementMetric("gemini_rate_limits_total");
  throw getGeminiCooldownError(action);
}

async function withGeminiConcurrencyLimit<T>(task: () => Promise<T>, priority: GeminiRequestPriority) {
  if (activeGeminiRequests < env.GEMINI_MAX_CONCURRENT_REQUESTS) {
    activeGeminiRequests += 1;

    try {
      return await task();
    } finally {
      releaseGeminiSlot();
    }
  }

  return new Promise<T>((resolve, reject) => {
    enqueueGeminiTask({
      priority,
      run: task as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject
    });
  });
}

function getGeminiCooldownError(action: string) {
  const retryAfterMs = Math.max(geminiCooldownUntil - Date.now(), 0) || env.GEMINI_COOLDOWN_MS;

  return new GeminiApiError({
    action,
    status: 429,
    responseText: "Gemini is in cooldown after recent rate limiting.",
    retryAfterMs
  });
}

export function isGeminiRateLimitError(error: unknown): error is GeminiApiError {
  return error instanceof GeminiApiError && error.status === 429;
}

export async function fetchGeminiJson<T>(input: {
  url: string;
  body: unknown;
  action: string;
  priority?: GeminiRequestPriority;
}) {
  const startedAt = Date.now();
  const priority = input.priority ?? "normal";

  await waitForGeminiCooldownIfAllowed(input.action, priority);

  return withGeminiConcurrencyLimit(async () => {
    await incrementMetric("gemini_requests_total");

    const response = await fetch(input.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input.body)
    });

    if (!response.ok) {
      const responseText = await response.text();
      const retryAfterMs = parseRetryAfterHeader(response.headers.get("retry-after"));
      await observeDurationMetric("gemini_request_duration_ms", Date.now() - startedAt);
      await incrementMetric("gemini_failures_total");

      if (response.status === 429) {
        geminiCooldownUntil = Date.now() + (retryAfterMs ?? env.GEMINI_COOLDOWN_MS);
        await incrementMetric("gemini_rate_limits_total");
      }

      throw new GeminiApiError({
        action: input.action,
        status: response.status,
        responseText,
        retryAfterMs
      });
    }

    geminiCooldownUntil = 0;
    await observeDurationMetric("gemini_request_duration_ms", Date.now() - startedAt);
    return (await response.json()) as T;
  }, priority);
}
