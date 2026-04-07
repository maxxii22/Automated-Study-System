import type { ErrorRequestHandler } from "express";
import multer from "multer";

import { logError } from "../lib/logger.js";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    return response.status(400).json({
      message: error.code === "LIMIT_FILE_SIZE" ? "PDF must be 10 MB or smaller." : error.message
    });
  }

  if (error instanceof Error) {
    const maybeStatus = (error as Error & { status?: unknown }).status;
    const status =
      typeof maybeStatus === "number" && maybeStatus >= 400 && maybeStatus < 600
        ? maybeStatus
        : 500;

    logError("Unhandled API error", {
      error: error.message,
      status
    });

    return response.status(status).json({ message: error.message });
  }

  return response.status(500).json({ message: "Unexpected server error." });
};
