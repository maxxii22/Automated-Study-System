import type {
  Flashcard,
  GenerateStudySetResponse,
  PaginatedFlashcardsResponse,
  PaginatedStudySetsResponse,
  StudySet,
  StudySetListItem
} from "@automated-study-system/shared";

import { prisma } from "../lib/prisma.js";

const MAX_PAGE_SIZE = 25;
const EXAM_CONTEXT_FLASHCARD_LIMIT = 6;

type StudySetListCursor = {
  id: string;
  updatedAt: string;
};

type FlashcardListCursor = {
  id: string;
  order: number;
};

function toFlashcard(record: { id: string; question: string; answer: string; order: number }): Flashcard {
  return {
    id: record.id,
    question: record.question,
    answer: record.answer,
    order: record.order
  };
}

function toStudySet(record: {
  id: string;
  ownerId: string | null;
  title: string;
  sourceText: string;
  sourceType: string;
  sourceFileName: string | null;
  summary: string;
  studyGuide: string;
  keyConcepts: string[];
  createdAt: Date;
  updatedAt: Date;
  flashcards: Array<{ id: string; question: string; answer: string; order: number }>;
  _count?: { flashcards: number };
}): StudySet {
  return {
    id: record.id,
    title: record.title,
    sourceText: record.sourceText,
    sourceType: record.sourceType as "text" | "pdf",
    sourceFileName: record.sourceFileName ?? undefined,
    summary: record.summary,
    studyGuide: record.studyGuide,
    keyConcepts: record.keyConcepts,
    flashcards: record.flashcards.map(toFlashcard),
    flashcardCount: record._count?.flashcards ?? record.flashcards.length,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function toStudySetListItem(record: {
  id: string;
  ownerId: string | null;
  title: string;
  sourceType: string;
  sourceFileName: string | null;
  summary: string;
  keyConcepts: string[];
  createdAt: Date;
  updatedAt: Date;
  _count: { flashcards: number };
}): StudySetListItem {
  return {
    id: record.id,
    title: record.title,
    sourceType: record.sourceType as "text" | "pdf",
    sourceFileName: record.sourceFileName ?? undefined,
    summary: record.summary,
    keyConcepts: record.keyConcepts,
    flashcardCount: record._count.flashcards,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function encodeCursor(value: StudySetListCursor | FlashcardListCursor) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor<T>(cursor: string | undefined): T | null {
  if (!cursor) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

async function resolveStudySetCursor(ownerId: string, cursor?: string) {
  const parsedCursor = decodeCursor<StudySetListCursor>(cursor);

  if (parsedCursor?.id && parsedCursor.updatedAt) {
    return {
      id: parsedCursor.id,
      updatedAt: new Date(parsedCursor.updatedAt)
    };
  }

  if (!cursor) {
    return null;
  }

  const record = await prisma.studySet.findFirst({
    where: {
      id: cursor,
      ownerId
    },
    select: {
      id: true,
      updatedAt: true
    }
  });

  return record ?? null;
}

async function resolveFlashcardCursor(studySetId: string, cursor?: string) {
  const parsedCursor = decodeCursor<FlashcardListCursor>(cursor);

  if (parsedCursor?.id && Number.isFinite(parsedCursor.order)) {
    return parsedCursor;
  }

  if (!cursor) {
    return null;
  }

  const record = await prisma.flashcard.findFirst({
    where: {
      id: cursor,
      studySetId
    },
    select: {
      id: true,
      order: true
    }
  });

  return record ?? null;
}

function toExamContext(record: {
  id: string;
  title: string;
  sourceText: string;
  sourceType: string;
  sourceFileName: string | null;
  summary: string;
  studyGuide: string;
  keyConcepts: string[];
  createdAt: Date;
  updatedAt: Date;
  flashcards: Array<{ question: string; answer: string; order: number }>;
}): StudySet {
  return {
    id: record.id,
    title: record.title,
    sourceText: record.sourceText,
    sourceType: record.sourceType as "text" | "pdf",
    sourceFileName: record.sourceFileName ?? undefined,
    summary: record.summary,
    studyGuide: record.studyGuide,
    keyConcepts: record.keyConcepts,
    flashcards: record.flashcards.map((card, index) => ({
      id: `exam-context-${index}`,
      question: card.question,
      answer: card.answer,
      order: card.order
    })),
    flashcardCount: record.flashcards.length,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export async function createStudySet(payload: {
  ownerId: string;
  title: string;
  sourceText: string;
  sourceType: "text" | "pdf";
  sourceFileName?: string;
  generated: GenerateStudySetResponse;
}) {
  const record = await prisma.studySet.create({
    data: {
      ownerId: payload.ownerId,
      title: payload.generated.title,
      sourceText: payload.sourceText,
      sourceType: payload.sourceType,
      sourceFileName: payload.sourceFileName,
      summary: payload.generated.summary,
      studyGuide: payload.generated.studyGuide,
      keyConcepts: payload.generated.keyConcepts,
      flashcards: {
        create: payload.generated.flashcards.map((card, index) => ({
          question: card.question,
          answer: card.answer,
          order: card.order ?? index + 1
        }))
      }
    },
    include: {
      flashcards: {
        orderBy: { order: "asc" },
        take: 10
      },
      _count: {
        select: { flashcards: true }
      }
    }
  });

  return toStudySet(record);
}

export async function listStudySets(ownerId: string, cursor?: string, limit = 10): Promise<PaginatedStudySetsResponse> {
  const take = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
  const resolvedCursor = await resolveStudySetCursor(ownerId, cursor);
  const records = await prisma.studySet.findMany({
    where: {
      ownerId,
      ...(resolvedCursor
        ? {
            OR: [
              {
                updatedAt: {
                  lt: resolvedCursor.updatedAt
                }
              },
              {
                updatedAt: resolvedCursor.updatedAt,
                id: {
                  lt: resolvedCursor.id
                }
              }
            ]
          }
        : {})
    },
    take: take + 1,
    orderBy: [
      { updatedAt: "desc" },
      { id: "desc" }
    ],
    select: {
      id: true,
      ownerId: true,
      title: true,
      sourceType: true,
      sourceFileName: true,
      summary: true,
      keyConcepts: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { flashcards: true }
      }
    }
  });

  const hasMore = records.length > take;
  const items = records.slice(0, take).map(toStudySetListItem);

  return {
    items,
    page: {
      hasMore,
      nextCursor: hasMore
        ? encodeCursor({
            id: records[take - 1].id,
            updatedAt: records[take - 1].updatedAt.toISOString()
          })
        : undefined
    }
  };
}

export async function getStudySet(ownerId: string, id: string) {
  const record = await prisma.studySet.findFirst({
    where: {
      id,
      ownerId
    },
    include: {
      flashcards: {
        orderBy: { order: "asc" },
        take: 10
      },
      _count: {
        select: { flashcards: true }
      }
    }
  });

  return record ? toStudySet(record) : null;
}

export async function studySetExists(ownerId: string, id: string) {
  const record = await prisma.studySet.findFirst({
    where: {
      id,
      ownerId
    },
    select: {
      id: true
    }
  });

  return Boolean(record);
}

export async function getStudySetEvaluationContext(ownerId: string, id: string) {
  const record = await prisma.studySet.findFirst({
    where: {
      id,
      ownerId
    },
    select: {
      id: true,
      title: true,
      sourceText: true,
      sourceType: true,
      sourceFileName: true,
      summary: true,
      studyGuide: true,
      keyConcepts: true,
      createdAt: true,
      updatedAt: true,
      flashcards: {
        orderBy: { order: "asc" },
        take: EXAM_CONTEXT_FLASHCARD_LIMIT,
        select: {
          question: true,
          answer: true,
          order: true
        }
      }
    }
  });

  return record ? toExamContext(record) : null;
}

export async function deleteStudySet(ownerId: string, id: string) {
  const deleted = await prisma.studySet.deleteMany({
    where: {
      id,
      ownerId
    }
  });

  if (deleted.count === 0) {
    throw new Error("Study set not found.");
  }
}

export async function listFlashcards(ownerId: string, studySetId: string, cursor?: string, limit = 10): Promise<PaginatedFlashcardsResponse> {
  if (!(await studySetExists(ownerId, studySetId))) {
    throw new Error("Study set not found.");
  }

  const take = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
  const resolvedCursor = await resolveFlashcardCursor(studySetId, cursor);
  const records = await prisma.flashcard.findMany({
    where: {
      studySetId,
      ...(resolvedCursor
        ? {
            OR: [
              {
                order: {
                  gt: resolvedCursor.order
                }
              },
              {
                order: resolvedCursor.order,
                id: {
                  gt: resolvedCursor.id
                }
              }
            ]
          }
        : {})
    },
    take: take + 1,
    orderBy: [
      { order: "asc" },
      { id: "asc" }
    ]
  });

  const hasMore = records.length > take;
  const items = records.slice(0, take).map(toFlashcard);

  return {
    items,
    page: {
      hasMore,
      nextCursor: hasMore
        ? encodeCursor({
            id: records[take - 1].id,
            order: records[take - 1].order
          })
        : undefined
    }
  };
}

export async function getStudySetById(id: string) {
  const record = await prisma.studySet.findUnique({
    where: { id },
    include: {
      flashcards: {
        orderBy: { order: "asc" },
        take: 10
      },
      _count: {
        select: { flashcards: true }
      }
    }
  });

  return record ? toStudySet(record) : null;
}

export async function cloneStudySetToOwner(studySetId: string, ownerId: string) {
  const sourceStudySet = await prisma.studySet.findUnique({
    where: { id: studySetId },
    include: {
      flashcards: {
        orderBy: { order: "asc" }
      }
    }
  });

  if (!sourceStudySet) {
    return null;
  }

  const cloned = await prisma.studySet.create({
    data: {
      ownerId,
      title: sourceStudySet.title,
      sourceText: sourceStudySet.sourceText,
      sourceType: sourceStudySet.sourceType,
      sourceFileName: sourceStudySet.sourceFileName,
      summary: sourceStudySet.summary,
      studyGuide: sourceStudySet.studyGuide,
      keyConcepts: sourceStudySet.keyConcepts,
      flashcards: {
        create: sourceStudySet.flashcards.map((card: (typeof sourceStudySet.flashcards)[number]) => ({
          question: card.question,
          answer: card.answer,
          order: card.order
        }))
      }
    },
    include: {
      flashcards: {
        orderBy: { order: "asc" },
        take: 10
      },
      _count: {
        select: { flashcards: true }
      }
    }
  });

  return toStudySet(cloned);
}
