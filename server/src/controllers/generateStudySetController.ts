import type { Request, Response } from "express";
import { z } from "zod";

import { generateStudyMaterials } from "../services/geminiService.js";

export async function generateStudySetController(request: Request, response: Response) {
  const title = z.string().min(2).max(120).safeParse(request.body.title);
  const sourceType =
    request.file && request.file.mimetype === "application/pdf" ? "pdf" : ("text" as const);

  if (!title.success) {
    return response.status(400).json({
      message: "Invalid study set payload.",
      issues: { fieldErrors: { title: ["Title must be between 2 and 120 characters."] } }
    });
  }

  try {
    if (sourceType === "pdf") {
      const uploadedFile = request.file;

      if (!uploadedFile) {
        return response.status(400).json({
          message: "A PDF file is required."
        });
      }

      const studyPack = await generateStudyMaterials({
        title: title.data,
        sourceType: "pdf",
        sourceFileName: uploadedFile.originalname,
        pdfFile: {
          buffer: uploadedFile.buffer,
          mimeType: uploadedFile.mimetype,
          fileName: uploadedFile.originalname
        }
      });

      return response.status(200).json(studyPack);
    }

    const sourceText = z.string().min(50).max(30000).safeParse(request.body.sourceText);

    if (!sourceText.success) {
      return response.status(400).json({
        message: "Invalid study set payload.",
        issues: { fieldErrors: { sourceText: ["Source text must be between 50 and 30000 characters."] } }
      });
    }

    const studyPack = await generateStudyMaterials({
      title: title.data,
      sourceType: "text",
      sourceText: sourceText.data
    });

    return response.status(200).json(studyPack);
  } catch (error) {
    return response.status(500).json({
      message: error instanceof Error ? error.message : "Study generation failed."
    });
  }
}
