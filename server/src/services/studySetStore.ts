import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { GenerateStudySetResponse, StudySet } from "@automated-study-system/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFilePath = path.resolve(__dirname, "../data/studySets.json");

async function ensureDataFile() {
  await mkdir(path.dirname(dataFilePath), { recursive: true });

  try {
    await readFile(dataFilePath, "utf8");
  } catch {
    await writeFile(dataFilePath, "[]", "utf8");
  }
}

async function readStudySets(): Promise<StudySet[]> {
  await ensureDataFile();
  const raw = await readFile(dataFilePath, "utf8");
  return JSON.parse(raw) as StudySet[];
}

async function writeStudySets(studySets: StudySet[]) {
  await writeFile(dataFilePath, JSON.stringify(studySets, null, 2), "utf8");
}

export async function listStoredStudySets(): Promise<StudySet[]> {
  const studySets = await readStudySets();
  return studySets.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getStoredStudySet(id: string): Promise<StudySet | null> {
  const studySets = await readStudySets();
  return studySets.find((studySet) => studySet.id === id) ?? null;
}

export async function saveGeneratedStudySet(
  payload: {
    sourceText: string;
    sourceType: "text" | "pdf";
    sourceFileName?: string;
  } & GenerateStudySetResponse
): Promise<StudySet> {
  const studySets = await readStudySets();
  const timestamp = new Date().toISOString();

  const studySet: StudySet = {
    id: randomUUID(),
    title: payload.title,
    sourceText: payload.sourceText,
    sourceType: payload.sourceType,
    sourceFileName: payload.sourceFileName,
    summary: payload.summary,
    studyGuide: payload.studyGuide,
    keyConcepts: payload.keyConcepts,
    flashcards: payload.flashcards.map((card, index) => ({
      id: randomUUID(),
      question: card.question,
      answer: card.answer,
      order: card.order ?? index + 1
    })),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  studySets.unshift(studySet);
  await writeStudySets(studySets);
  return studySet;
}
