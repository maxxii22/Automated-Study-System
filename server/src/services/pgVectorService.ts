import { env } from "../config/env.js";
import { logError, logInfo } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

let pgVectorReady = false;
let pgVectorInitialized = false;

function toVectorLiteral(vector: number[]) {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

export function isPgVectorReady() {
  return pgVectorReady;
}

export async function ensurePgVectorInfrastructure() {
  if (pgVectorInitialized) {
    return pgVectorReady;
  }

  pgVectorInitialized = true;

  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "semantic_vector" vector(${env.GEMINI_EMBEDDING_DIMENSIONALITY});`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Document_semantic_vector_idx" ON "Document" USING ivfflat ("semantic_vector" vector_cosine_ops) WITH (lists = 100);`
    );
    pgVectorReady = true;
    logInfo("pgvector ready", {
      dimensions: env.GEMINI_EMBEDDING_DIMENSIONALITY
    });
  } catch (error) {
    pgVectorReady = false;
    logError("pgvector unavailable, falling back to in-memory semantic search", {
      error: error instanceof Error ? error.message : "Unknown pgvector error"
    });
  }

  return pgVectorReady;
}

export async function updateDocumentSemanticVector(documentId: string, vector: number[]) {
  if (!pgVectorReady || vector.length === 0) {
    return;
  }

  const vectorLiteral = toVectorLiteral(vector);
  await prisma.$executeRawUnsafe(
    `UPDATE "Document" SET "semantic_vector" = $1::vector WHERE "id" = $2`,
    vectorLiteral,
    documentId
  );
}

export async function queryNearestDocumentIds(sourceType: "text" | "pdf", ownerId: string, vector: number[], limit: number) {
  if (!pgVectorReady || vector.length === 0) {
    return [] as Array<{ id: string; similarity: number }>;
  }

  const vectorLiteral = toVectorLiteral(vector);

  return prisma.$queryRawUnsafe<Array<{ id: string; similarity: number }>>(
    `
      SELECT d."id", 1 - (d."semantic_vector" <=> $1::vector) AS "similarity"
      FROM "Document" d
      INNER JOIN "StudySet" s ON s."id" = d."studySetId"
      INNER JOIN "DocumentOwner" do ON do."documentId" = d."id"
      WHERE d."studySetId" IS NOT NULL
        AND d."semantic_vector" IS NOT NULL
        AND s."sourceType" = $2
        AND do."ownerId" = $3
      ORDER BY d."semantic_vector" <=> $1::vector
      LIMIT $4
    `,
    vectorLiteral,
    sourceType,
    ownerId,
    limit
  );
}
