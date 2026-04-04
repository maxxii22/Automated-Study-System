import type { GenerateStudySetResponse, StudySetJob } from "@automated-study-system/shared";
import type { Prisma } from "../../generated/prisma/index.js";

import { prisma } from "../lib/prisma.js";

function toStudyJob(record: {
  id: string;
  ownerId: string | null;
  title: string;
  sourceType: string;
  status: string;
  stage: string | null;
  progressPercent: number | null;
  cacheHit: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  studySetId: string | null;
  generatedPayload: unknown;
  sourceFileName: string | null;
  sourceObjectKey: string | null;
  documentHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}): StudySetJob {
  const generatedStudySet =
    record.generatedPayload && typeof record.generatedPayload === "object"
      ? (record.generatedPayload as GenerateStudySetResponse)
      : undefined;

  return {
    id: record.id,
    title: record.title,
    sourceType: record.sourceType as "text" | "pdf",
    status: record.status as StudySetJob["status"],
    stage: record.stage ?? undefined,
    progressPercent: record.progressPercent ?? undefined,
    cacheHit: record.cacheHit,
    errorCode: record.errorCode ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
    studySetId: record.studySetId ?? undefined,
    generatedStudySet,
    sourceFileName: record.sourceFileName ?? undefined,
    sourceObjectKey: record.sourceObjectKey ?? undefined,
    documentHash: record.documentHash ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    completedAt: record.completedAt?.toISOString()
  };
}

export async function createStudyJob(payload: {
  ownerId: string;
  title: string;
  sourceType: "text" | "pdf";
  sourceText?: string;
  sourceFileName?: string;
  sourceObjectKey?: string;
  documentHash?: string;
  status?: "queued" | "completed";
  cacheHit?: boolean;
  stage?: string;
  progressPercent?: number;
  studySetId?: string;
  generatedPayload?: GenerateStudySetResponse;
}) {
  const record = await prisma.studyJob.create({
    data: {
      ownerId: payload.ownerId,
      title: payload.title,
      sourceType: payload.sourceType,
      sourceText: payload.sourceText,
      sourceFileName: payload.sourceFileName,
      sourceObjectKey: payload.sourceObjectKey,
      documentHash: payload.documentHash,
      status: payload.status ?? "queued",
      stage: payload.stage ?? "queued",
      progressPercent: payload.progressPercent ?? 0,
      cacheHit: payload.cacheHit ?? false,
      studySetId: payload.studySetId,
      generatedPayload: payload.generatedPayload,
      completedAt: payload.status === "completed" ? new Date() : undefined
    }
  });

  return toStudyJob(record);
}

export async function findStudyJob(ownerId: string, id: string) {
  const record = await prisma.studyJob.findFirst({
    where: { id, ownerId }
  });

  return record ? toStudyJob(record) : null;
}

export async function findActiveStudyJobByHash(ownerId: string, documentHash: string) {
  const record = await prisma.studyJob.findFirst({
    where: {
      ownerId,
      documentHash,
      status: {
        in: ["queued", "processing"]
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return record ? toStudyJob(record) : null;
}

export async function findCompletedStudyJobByHash(ownerId: string, documentHash: string) {
  const record = await prisma.studyJob.findFirst({
    where: {
      ownerId,
      documentHash,
      status: "completed"
    },
    orderBy: { createdAt: "desc" }
  });

  return record ? toStudyJob(record) : null;
}

export async function listStudyJobsByStatus(
  ownerId: string,
  statuses: Array<"queued" | "processing" | "completed" | "failed">,
  limit = 10
) {
  const records = await prisma.studyJob.findMany({
    where: {
      ownerId,
      status: {
        in: statuses
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: limit
  });

  return records.map(toStudyJob);
}

export async function listStudyJobsByStatusAcrossOwners(
  statuses: Array<"queued" | "processing" | "completed" | "failed">,
  limit = 10
) {
  const records = await prisma.studyJob.findMany({
    where: {
      status: {
        in: statuses
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: limit
  });

  return records.map(toStudyJob);
}

export async function listStaleProcessingStudyJobs(ownerId: string, staleBefore: Date, limit = 20) {
  const records = await prisma.studyJob.findMany({
    where: {
      ownerId,
      status: "processing",
      updatedAt: {
        lt: staleBefore
      }
    },
    orderBy: {
      updatedAt: "asc"
    },
    take: limit
  });

  return records.map(toStudyJob);
}

export async function listStaleProcessingStudyJobsAcrossOwners(staleBefore: Date, limit = 20) {
  const records = await prisma.studyJob.findMany({
    where: {
      status: "processing",
      updatedAt: {
        lt: staleBefore
      }
    },
    orderBy: {
      updatedAt: "asc"
    },
    take: limit
  });

  return records.map(toStudyJob);
}

export async function listRecoverableStaleStudyJobs(staleBefore: Date, limit = 20) {
  return prisma.studyJob.findMany({
    where: {
      status: "processing",
      updatedAt: {
        lt: staleBefore
      },
      ownerId: {
        not: null
      }
    },
    orderBy: {
      updatedAt: "asc"
    },
    take: limit,
    select: {
      id: true,
      ownerId: true
    }
  });
}

export async function updateStudyJob(
  ownerId: string,
  id: string,
  payload: Partial<{
    status: "queued" | "processing" | "completed" | "failed";
    stage: string | null;
    progressPercent: number | null;
    cacheHit: boolean;
    errorCode: string | null;
    errorMessage: string | null;
    studySetId: string | null;
    generatedPayload: GenerateStudySetResponse | null;
    completedAt: Date | null;
  }>
) {
  const data: Prisma.StudyJobUncheckedUpdateManyInput = {
    status: payload.status,
    stage: payload.stage,
    progressPercent: payload.progressPercent,
    cacheHit: payload.cacheHit,
    errorCode: payload.errorCode,
    errorMessage: payload.errorMessage,
    studySetId: payload.studySetId,
    generatedPayload: payload.generatedPayload as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined,
    completedAt: payload.completedAt
  };

  const updated = await prisma.studyJob.updateMany({
    where: { id, ownerId },
    data
  });

  if (updated.count === 0) {
    throw new Error("Study job not found.");
  }

  const record = await prisma.studyJob.findUnique({
    where: { id }
  });

  if (!record || record.ownerId !== ownerId) {
    throw new Error("Study job not found.");
  }

  return toStudyJob(record);
}

export async function upsertDocumentRecord(payload: {
  hash: string;
  sourceFileName?: string;
  sourceObjectKey: string;
  mimeType: string;
  byteSize: number;
  extractedText?: string;
}) {
  return prisma.document.upsert({
    where: { hash: payload.hash },
    update: {
      sourceFileName: payload.sourceFileName,
      sourceObjectKey: payload.sourceObjectKey,
      mimeType: payload.mimeType,
      byteSize: payload.byteSize,
      extractedText: payload.extractedText
    },
    create: {
      hash: payload.hash,
      sourceFileName: payload.sourceFileName,
      sourceObjectKey: payload.sourceObjectKey,
      mimeType: payload.mimeType,
      byteSize: payload.byteSize,
      extractedText: payload.extractedText
    }
  });
}

export async function findDocumentByHash(hash: string) {
  return prisma.document.findUnique({
    where: { hash }
  });
}

export async function findDocumentByHashForOwner(ownerId: string, hash: string) {
  return prisma.document.findFirst({
    where: {
      hash,
      owners: {
        some: {
          ownerId
        }
      }
    }
  });
}

export async function ensureDocumentOwner(documentId: string, ownerId: string) {
  return prisma.documentOwner.upsert({
    where: {
      documentId_ownerId: {
        documentId,
        ownerId
      }
    },
    update: {},
    create: {
      documentId,
      ownerId
    }
  });
}

export async function attachDocumentToStudySet(hash: string, studySetId: string) {
  return prisma.document.update({
    where: { hash },
    data: {
      studySetId
    }
  });
}

export async function updateDocumentExtractedText(hash: string, extractedText: string) {
  return prisma.document.update({
    where: { hash },
    data: {
      extractedText
    }
  });
}

export async function replaceDocumentEmbeddings(
  documentId: string,
  embeddings: Array<{ chunkIndex: number; content: string; embedding: number[] }>
) {
  await prisma.documentEmbedding.deleteMany({
    where: { documentId }
  });

  if (embeddings.length === 0) {
    return [];
  }

  await prisma.documentEmbedding.createMany({
    data: embeddings.map((item) => ({
      documentId,
      chunkIndex: item.chunkIndex,
      content: item.content,
      embedding: item.embedding
    }))
  });

  return prisma.documentEmbedding.findMany({
    where: { documentId },
    orderBy: { chunkIndex: "asc" }
  });
}

export async function findSemanticCandidateDocuments(ownerId: string, sourceType: "text" | "pdf", limit = 20) {
  const records = await prisma.document.findMany({
    where: {
      owners: {
        some: {
          ownerId
        }
      },
      studySetId: {
        not: null
      },
      extractedText: {
        not: null
      },
      studySet: {
        is: {
          sourceType
        }
      },
      embeddings: {
        some: {}
      }
    },
    include: {
      embeddings: {
        orderBy: { chunkIndex: "asc" }
      },
      studySet: {
        include: {
          flashcards: {
            orderBy: { order: "asc" },
            take: 12
          },
          _count: {
            select: { flashcards: true }
          }
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: limit
  });

  return records
    .filter((record): record is typeof record & { studySet: NonNullable<typeof record.studySet> } => Boolean(record.studySet))
    .map((record) => ({
      documentId: record.id,
      hash: record.hash,
      sourceText: record.extractedText ?? "",
      sourceType: record.studySet.sourceType as "text" | "pdf",
      studySet: {
        id: record.studySet.id,
        title: record.studySet.title,
        sourceText: record.studySet.sourceText,
        sourceType: record.studySet.sourceType as "text" | "pdf",
        sourceFileName: record.studySet.sourceFileName ?? undefined,
        summary: record.studySet.summary,
        studyGuide: record.studySet.studyGuide,
        keyConcepts: record.studySet.keyConcepts,
        flashcards: record.studySet.flashcards.map((card: (typeof record.studySet.flashcards)[number]) => ({
          id: card.id,
          question: card.question,
          answer: card.answer,
          order: card.order
        })),
        flashcardCount: record.studySet._count.flashcards,
        createdAt: record.studySet.createdAt.toISOString(),
        updatedAt: record.studySet.updatedAt.toISOString()
      },
      embeddings: record.embeddings.map((embedding: (typeof record.embeddings)[number]) => ({
        chunkIndex: embedding.chunkIndex,
        content: embedding.content,
        embedding: Array.isArray(embedding.embedding)
          ? embedding.embedding.filter((value: unknown): value is number => typeof value === "number")
          : []
      }))
    }));
}

export async function findSemanticCandidateDocumentsByIds(ownerId: string, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  const records = await prisma.document.findMany({
    where: {
      id: {
        in: ids
      },
      owners: {
        some: {
          ownerId
        }
      },
      studySetId: {
        not: null
      },
      extractedText: {
        not: null
      },
      embeddings: {
        some: {}
      }
    },
    include: {
      embeddings: {
        orderBy: { chunkIndex: "asc" }
      },
      studySet: {
        include: {
          flashcards: {
            orderBy: { order: "asc" },
            take: 12
          },
          _count: {
            select: { flashcards: true }
          }
        }
      }
    }
  });

  const order = new Map(ids.map((id, index) => [id, index]));

  return records
    .filter((record): record is typeof record & { studySet: NonNullable<typeof record.studySet> } => Boolean(record.studySet))
    .sort(
      (
        left: (typeof records)[number] & { studySet: NonNullable<(typeof records)[number]["studySet"]> },
        right: (typeof records)[number] & { studySet: NonNullable<(typeof records)[number]["studySet"]> }
      ) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    )
    .map((record) => ({
      documentId: record.id,
      hash: record.hash,
      sourceText: record.extractedText ?? "",
      sourceType: record.studySet.sourceType as "text" | "pdf",
      studySet: {
        id: record.studySet.id,
        title: record.studySet.title,
        sourceText: record.studySet.sourceText,
        sourceType: record.studySet.sourceType as "text" | "pdf",
        sourceFileName: record.studySet.sourceFileName ?? undefined,
        summary: record.studySet.summary,
        studyGuide: record.studySet.studyGuide,
        keyConcepts: record.studySet.keyConcepts,
        flashcards: record.studySet.flashcards.map((card: (typeof record.studySet.flashcards)[number]) => ({
          id: card.id,
          question: card.question,
          answer: card.answer,
          order: card.order
        })),
        flashcardCount: record.studySet._count.flashcards,
        createdAt: record.studySet.createdAt.toISOString(),
        updatedAt: record.studySet.updatedAt.toISOString()
      },
      embeddings: record.embeddings.map((embedding: (typeof record.embeddings)[number]) => ({
        chunkIndex: embedding.chunkIndex,
        content: embedding.content,
        embedding: Array.isArray(embedding.embedding)
          ? embedding.embedding.filter((value: unknown): value is number => typeof value === "number")
          : []
      }))
    }));
}

export async function listDocumentOwners(documentId: string) {
  return prisma.documentOwner.findMany({
    where: { documentId },
    select: { ownerId: true }
  });
}
