import type { Request, Response } from "express";

import { transcribeExamAnswer } from "../services/geminiService.js";

export async function transcribeExamAnswerController(request: Request, response: Response) {
  if (!request.file) {
    return response.status(400).json({
      message: "Record an audio answer before requesting transcription."
    });
  }

  try {
    const transcript = await transcribeExamAnswer({
      audioFile: {
        buffer: request.file.buffer,
        mimeType: request.file.mimetype,
        fileName: request.file.originalname
      }
    });

    return response.status(200).json({ transcript });
  } catch (error) {
    return response.status(500).json({
      message: error instanceof Error ? error.message : "Audio transcription failed."
    });
  }
}
