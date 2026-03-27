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
import { generateStudySetRateLimit } from "../middleware/rateLimit.js";
import { audioUpload } from "../middleware/upload.js";
import {
  deleteStudySetController,
  getStudySetController,
  listStudySetFlashcardsController,
  listStudySetsController
} from "../controllers/studySetController.js";

export const studySetRouter = Router();

studySetRouter.get("/", listStudySetsController);
studySetRouter.get("/:id/exam-sessions", listExamSessionsController);
studySetRouter.put("/:id/exam-sessions/:sessionId", saveExamSessionController);
studySetRouter.get("/:id/rescue-attempts", listRescueAttemptsController);
studySetRouter.post("/:id/rescue-attempts", createRescueAttemptController);
studySetRouter.post("/:id/rescue-attempts/:rescueId/retry", submitRescueRetryController);
studySetRouter.get("/:id/flashcards", listStudySetFlashcardsController);
studySetRouter.get("/:id", getStudySetController);
studySetRouter.post("/generate", generateStudySetRateLimit, generateStudySetController);
studySetRouter.post("/", generateStudySetRateLimit, saveStudySetController);
studySetRouter.post("/exam-turn", evaluateExamTurnController);
studySetRouter.post("/transcribe-answer", audioUpload.single("audioFile"), transcribeExamAnswerController);
studySetRouter.delete("/:id", deleteStudySetController);
