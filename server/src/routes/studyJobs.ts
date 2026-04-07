import { Router } from "express";

import {
  createStudyJobController,
  getStudyJobController,
  getStudyJobOpsSummaryController,
  recoverStaleStudyJobsController,
  retryStudyJobController
} from "../controllers/studyJobController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAdmin } from "../middleware/auth.js";
import { pdfStudyJobRateLimit } from "../middleware/rateLimit.js";
import { upload } from "../middleware/upload.js";

export const studyJobRouter = Router();

studyJobRouter.get("/ops/summary", requireAdmin, asyncHandler(getStudyJobOpsSummaryController));
studyJobRouter.post("/ops/recover-stale", requireAdmin, asyncHandler(recoverStaleStudyJobsController));
studyJobRouter.post("/", pdfStudyJobRateLimit, upload.single("sourceFile"), asyncHandler(createStudyJobController));
studyJobRouter.post("/:id/retry", asyncHandler(retryStudyJobController));
studyJobRouter.get("/:id", asyncHandler(getStudyJobController));
