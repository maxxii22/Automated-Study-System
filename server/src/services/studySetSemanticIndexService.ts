import type { StudySet } from "@automated-study-system/shared";

import { env } from "../config/env.js";
import { ensurePgVectorInfrastructure, updateDocumentSemanticVector } from "./pgVectorService.js";
import {
  averageEmbeddings,
  buildStudySetSemanticSource,
  buildTextDocumentHash,
  chunkSemanticText,
  embedTextChunks,
  normalizeSemanticText,
  shouldRunSemanticCache
} from "./semanticCacheService.js";
import {
  attachDocumentToStudySet,
  ensureDocumentOwner,
  findDocumentByHash,
  replaceDocumentEmbeddings,
  updateDocumentExtractedText,
  upsertDocumentRecord
} from "./studyJobRepository.js";

export async function indexStudySetForSemanticCache(
  studySet: StudySet,
  options?: {
    ownerId?: string;
    documentHash?: string;
    sourceFileName?: string;
    extractedText?: string;
  }
) {
  if (!env.SEMANTIC_CACHE_ENABLED) {
    return;
  }

  const documentHash =
    options?.documentHash ??
    (options?.ownerId ? buildTextDocumentHash(options.ownerId, studySet.sourceText) : buildTextDocumentHash("anonymous", studySet.sourceText));
  const existingDocument = await findDocumentByHash(documentHash);
  const semanticSource = buildStudySetSemanticSource(studySet);
  const extractedSemanticText = normalizeSemanticText(
    options?.extractedText ?? existingDocument?.extractedText ?? semanticSource
  );

  if (!shouldRunSemanticCache(extractedSemanticText)) {
    return;
  }

  const chunks = chunkSemanticText(extractedSemanticText);

  if (chunks.length === 0) {
    return;
  }

  const embeddings = await embedTextChunks(chunks);
  const averageVector = averageEmbeddings(embeddings.map((item) => item.embedding));
  const sourceObjectKey =
    studySet.sourceType === "pdf"
      ? existingDocument?.sourceObjectKey ?? `study-set:${studySet.id}`
      : existingDocument?.sourceObjectKey ?? `inline:text:${documentHash}`;
  const mimeType = existingDocument?.mimeType ?? (studySet.sourceType === "pdf" ? "application/pdf" : "text/plain");
  const byteSize = existingDocument?.byteSize ?? Buffer.byteLength(studySet.sourceText || semanticSource, "utf8");

  const document = await upsertDocumentRecord({
    hash: documentHash,
    sourceFileName: options?.sourceFileName ?? studySet.sourceFileName,
    sourceObjectKey,
    mimeType,
    byteSize
  });

  if (options?.ownerId) {
    await ensureDocumentOwner(document.id, options.ownerId);
  }

  await attachDocumentToStudySet(documentHash, studySet.id);
  await updateDocumentExtractedText(documentHash, extractedSemanticText);
  await replaceDocumentEmbeddings(document.id, embeddings);
  await ensurePgVectorInfrastructure();
  await updateDocumentSemanticVector(document.id, averageVector);
}
