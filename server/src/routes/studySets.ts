import { Router } from "express";

import { generateStudySetController } from "../controllers/generateStudySetController.js";
import { saveStudySetController } from "../controllers/saveStudySetController.js";
import { generateStudySetRateLimit } from "../middleware/rateLimit.js";
import { upload } from "../middleware/upload.js";
import { getStudySetController, listStudySetsController } from "../controllers/studySetController.js";

export const studySetRouter = Router();

studySetRouter.get("/", listStudySetsController);
studySetRouter.get("/:id", getStudySetController);
studySetRouter.post("/generate", generateStudySetRateLimit, upload.single("sourceFile"), generateStudySetController);
studySetRouter.post("/", saveStudySetController);
