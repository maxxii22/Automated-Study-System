import { Router } from "express";

import {
  createStudyJobController,
  getStudyJobController,
  getStudyJobOpsSummaryController,
  recoverStaleStudyJobsController,
  retryStudyJobController
} from "../controllers/studyJobController.js";
import { requireAdmin } from "../middleware/auth.js";
import { pdfStudyJobRateLimit } from "../middleware/rateLimit.js";
import { upload } from "../middleware/upload.js";

export const studyJobRouter = Router();

studyJobRouter.get("/ops/summary", requireAdmin, getStudyJobOpsSummaryController);
studyJobRouter.post("/ops/recover-stale", requireAdmin, recoverStaleStudyJobsController);
studyJobRouter.post("/", pdfStudyJobRateLimit, upload.single("sourceFile"), createStudyJobController);
studyJobRouter.post("/:id/retry", retryStudyJobController);
studyJobRouter.get("/:id", getStudyJobController);
