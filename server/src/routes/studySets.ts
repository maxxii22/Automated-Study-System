import { Router } from "express";

import { evaluateExamTurnController } from "../controllers/evaluateExamTurnController.js";
import { generateStudySetController } from "../controllers/generateStudySetController.js";
import { saveStudySetController } from "../controllers/saveStudySetController.js";
import { transcribeExamAnswerController } from "../controllers/transcribeExamAnswerController.js";
import { generateStudySetRateLimit } from "../middleware/rateLimit.js";
import { audioUpload, upload } from "../middleware/upload.js";
import { getStudySetController, listStudySetsController } from "../controllers/studySetController.js";

export const studySetRouter = Router();

studySetRouter.get("/", listStudySetsController);
studySetRouter.get("/:id", getStudySetController);
studySetRouter.post("/generate", generateStudySetRateLimit, upload.single("sourceFile"), generateStudySetController);
studySetRouter.post("/exam-turn", generateStudySetRateLimit, evaluateExamTurnController);
studySetRouter.post("/transcribe-answer", generateStudySetRateLimit, audioUpload.single("audioFile"), transcribeExamAnswerController);
studySetRouter.post("/", saveStudySetController);
