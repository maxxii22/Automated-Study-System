import type { NextFunction, Request, Response } from "express";

import { incrementMetric, observeDurationMetric } from "../services/metricsService.js";

export function requestMetricsMiddleware(request: Request, response: Response, next: NextFunction) {
  if (request.path === "/api/metrics") {
    next();
    return;
  }

  const startedAt = Date.now();

  response.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    void incrementMetric("api_requests_total");
    void observeDurationMetric("api_request_duration_ms", durationMs);

    if (response.statusCode >= 400) {
      void incrementMetric("api_request_errors_total");
    }
  });

  next();
}
