const baseUrl = process.env.BASE_URL ?? "http://localhost:4000/api";
const autoRecover = process.env.RECOVER_STALE === "true";
const autoRetryFailed = process.env.RETRY_FAILED === "true";
const accessToken = process.env.ACCESS_TOKEN ?? "";

async function fetchJson(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return data;
}

async function run() {
  const health = await fetchJson(`${baseUrl}/health`);
  const summaryBefore = await fetchJson(`${baseUrl}/study-jobs/ops/summary`);

  console.log("Health services:");
  console.log(JSON.stringify(health.services, null, 2));
  console.log("\nQueue summary before:");
  console.log(JSON.stringify(summaryBefore, null, 2));

  if (autoRecover) {
    const recovery = await fetchJson(`${baseUrl}/study-jobs/ops/recover-stale`, { method: "POST" });
    console.log("\nRecovered stale jobs:");
    console.log(JSON.stringify(recovery, null, 2));
  }

  if (autoRetryFailed && Array.isArray(summaryBefore.recentFailedJobs)) {
    for (const job of summaryBefore.recentFailedJobs.slice(0, 5)) {
      const retried = await fetchJson(`${baseUrl}/study-jobs/${job.id}/retry`, { method: "POST" });
      console.log(`\nRetried job ${job.id}:`);
      console.log(JSON.stringify(retried, null, 2));
    }
  }

  const summaryAfter = await fetchJson(`${baseUrl}/study-jobs/ops/summary`);
  console.log("\nQueue summary after:");
  console.log(JSON.stringify(summaryAfter, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
