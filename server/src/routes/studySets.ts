import { Router } from "express";

import { evaluateExamTurnController } from "../controllers/evaluateExamTurnController.js";
import { listExamSessionsController, saveExamSessionController } from "../controllers/examSessionController.js";
import { generateStudySetController } from "../controllers/generateStudySetController.js";
import {
  createRescueAttemptController,
  listRescueAttemptsController,
  submitRescueRetryController
} from "../controllers/rescueController.js";
import { saveStudySetController } from "../controllers/saveStudySetController.js";
import { transcribeExamAnswerController } from "../controllers/transcribeExamAnswerController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { examRateLimit, generateStudySetRateLimit } from "../middleware/rateLimit.js";
import { audioUpload } from "../middleware/upload.js";
import {
  deleteStudySetController,
  getStudySetController,
  listStudySetFlashcardsController,
  listStudySetsController
} from "../controllers/studySetController.js";

export const studySetRouter = Router();

studySetRouter.get("/", asyncHandler(listStudySetsController));
studySetRouter.get("/:id/exam-sessions", asyncHandler(listExamSessionsController));
studySetRouter.put("/:id/exam-sessions/:sessionId", asyncHandler(saveExamSessionController));
studySetRouter.get("/:id/rescue-attempts", asyncHandler(listRescueAttemptsController));
studySetRouter.post("/:id/rescue-attempts", asyncHandler(createRescueAttemptController));
studySetRouter.post("/:id/rescue-attempts/:rescueId/retry", asyncHandler(submitRescueRetryController));
studySetRouter.get("/:id/flashcards", asyncHandler(listStudySetFlashcardsController));
studySetRouter.get("/:id", asyncHandler(getStudySetController));
studySetRouter.post("/generate", generateStudySetRateLimit, asyncHandler(generateStudySetController));
studySetRouter.post("/", generateStudySetRateLimit, asyncHandler(saveStudySetController));
studySetRouter.post("/exam-turn", examRateLimit, asyncHandler(evaluateExamTurnController));
studySetRouter.post("/transcribe-answer", examRateLimit, audioUpload.single("audioFile"), asyncHandler(transcribeExamAnswerController));
studySetRouter.delete("/:id", asyncHandler(deleteStudySetController));
