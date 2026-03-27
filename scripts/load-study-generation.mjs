const baseUrl = process.env.BASE_URL ?? "http://localhost:4000/api";
const totalRequests = Number(process.env.LOAD_REQUESTS ?? "6");
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? "2");
const accessToken = process.env.ACCESS_TOKEN ?? "";

function buildPayload(index) {
  const topic = `Load Test Topic ${index + 1}`;
  const sourceText = [
    `${topic} focuses on distributed job processing, observability, retries, and caching.`,
    "Study queues let the API return quickly while workers perform heavy background processing.",
    "Redis supports queue coordination, heartbeats, cache lookups, and event fanout for realtime status updates.",
    "Observability includes health checks, metrics, structured logs, queue depth, job latency, retry counts, and rate limit tracking.",
    "Resilience includes idempotency, retry with backoff, stale-job recovery, failure inspection, and dead-letter style operational tooling.",
    "Deployment hardening includes healthchecks, restart policies, production start commands, persistent services, and shared infrastructure."
  ].join(" ");

  return {
    title: topic,
    sourceType: "text",
    sourceText
  };
}

async function makeRequest(index) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/study-sets/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(buildPayload(index))
  });

  const elapsedMs = performance.now() - startedAt;
  const text = await response.text();

  return {
    index,
    ok: response.ok,
    status: response.status,
    elapsedMs,
    body: text.slice(0, 300)
  };
}

async function runLoad() {
  const results = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < totalRequests) {
      const current = nextIndex;
      nextIndex += 1;
      results.push(await makeRequest(current));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker()));
  results.sort((left, right) => left.index - right.index);

  const successes = results.filter((result) => result.ok);
  const failures = results.filter((result) => !result.ok);
  const durations = results.map((result) => result.elapsedMs).sort((left, right) => left - right);
  const averageMs = durations.reduce((sum, value) => sum + value, 0) / Math.max(durations.length, 1);
  const p95Index = Math.min(durations.length - 1, Math.max(0, Math.ceil(durations.length * 0.95) - 1));
  const p95Ms = durations[p95Index] ?? 0;

  console.log(`Base URL: ${baseUrl}`);
  console.log(`Requests: ${totalRequests}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Successes: ${successes.length}`);
  console.log(`Failures: ${failures.length}`);
  console.log(`Average latency: ${averageMs.toFixed(1)}ms`);
  console.log(`P95 latency: ${p95Ms.toFixed(1)}ms`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((failure) => {
      console.log(
        `- #${failure.index + 1}: status=${failure.status} latency=${failure.elapsedMs.toFixed(1)}ms body=${failure.body}`
      );
    });
  }
}

runLoad().catch((error) => {
  console.error(error);
  process.exit(1);
});
