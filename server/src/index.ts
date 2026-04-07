import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";

import { env, getAllowedClientOrigins } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { inspectRedisSafety, redis } from "./lib/redis.js";
import { createSocketServer } from "./lib/socket.js";
import { logInfo } from "./lib/logger.js";
import { asyncHandler } from "./middleware/asyncHandler.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestMetricsMiddleware } from "./middleware/metrics.js";
import { getStudyQueueCounts } from "./queue/studyGenerationQueue.js";
import { getWorkerHeartbeat } from "./services/cacheService.js";
import { startStudyJobEventBridge } from "./services/jobEvents.js";
import { renderPrometheusMetrics } from "./services/metricsService.js";
import { ensurePgVectorInfrastructure, isPgVectorReady } from "./services/pgVectorService.js";
import { studyJobRouter } from "./routes/studyJobs.js";
import { studySetRouter } from "./routes/studySets.js";

const app = express();
const port = env.PORT;
const httpServer = createServer(app);
const allowedOrigins = getAllowedClientOrigins();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const isAllowed =
        allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(origin));

      callback(isAllowed ? null : new Error(`Origin ${origin} is not allowed by CORS.`), isAllowed);
    },
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(requestMetricsMiddleware);

app.get("/api/health", asyncHandler(async (_request, response) => {
  await ensurePgVectorInfrastructure();
  const [database, redisStatus, queueCounts, redisSafety, workerHeartbeat] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
    getStudyQueueCounts(),
    inspectRedisSafety(),
    getWorkerHeartbeat()
  ]);

  const workerStatus = workerHeartbeat.status === "fulfilled" && workerHeartbeat.value ? "ok" : "missing";

  response.json({
    ok: database.status === "fulfilled" && redisStatus.status === "fulfilled",
    services: {
      database: database.status === "fulfilled" ? "ok" : "error",
      redis: redisStatus.status === "fulfilled" ? "ok" : "error",
      queue: queueCounts.status === "fulfilled" ? "ok" : "error",
      vector: isPgVectorReady() ? "ok" : "fallback",
      worker: workerStatus
    },
    queue: queueCounts.status === "fulfilled" ? queueCounts.value : null,
    redisPolicy: redisSafety.status === "fulfilled" ? redisSafety.value : null,
    worker: workerHeartbeat.status === "fulfilled" ? workerHeartbeat.value : null
  });
}));

app.get("/api/ready", asyncHandler(async (_request, response) => {
  const [database, redisStatus] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
  const ready = database.status === "fulfilled" && redisStatus.status === "fulfilled";

  response.status(ready ? 200 : 503).json({
    ready
  });
}));

app.get("/api/metrics", asyncHandler(async (_request, response) => {
  const output = await renderPrometheusMetrics();
  response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  response.send(output);
}));

app.use("/api/study-jobs", asyncHandler(requireAuth), studyJobRouter);
app.use("/api/study-sets", asyncHandler(requireAuth), studySetRouter);
app.use(errorHandler);

if (!process.env.VERCEL) {
  void ensurePgVectorInfrastructure();
  createSocketServer(httpServer);
  void startStudyJobEventBridge();
  httpServer.listen(port, () => {
    logInfo("API server listening", { url: `http://localhost:${port}` });
  });
}

export default app;
