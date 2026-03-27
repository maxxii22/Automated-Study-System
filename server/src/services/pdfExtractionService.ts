import { PDFParse } from "pdf-parse";

import { normalizeSemanticText } from "./semanticCacheService.js";

export async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });

  try {
    const parsed = await parser.getText();
    return normalizeSemanticText(parsed.text ?? "");
  } finally {
    await parser.destroy();
  }
}
