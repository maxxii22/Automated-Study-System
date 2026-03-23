import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";

import { env } from "./config/env.js";
import { studySetRouter } from "./routes/studySets.js";

const app = express();
const port = env.PORT;

app.use(
  cors({
    origin: env.CLIENT_ORIGIN
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.use("/api/study-sets", studySetRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    return response.status(400).json({
      message: error.code === "LIMIT_FILE_SIZE" ? "PDF must be 10 MB or smaller." : error.message
    });
  }

  if (error instanceof Error) {
    return response.status(400).json({ message: error.message });
  }

  return response.status(500).json({ message: "Unexpected server error." });
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

export default app;
