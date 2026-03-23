export type Flashcard = {
  id: string;
  question: string;
  answer: string;
  order: number;
};

export type StudySet = {
  id: string;
  title: string;
  sourceText: string;
  sourceType: "text" | "pdf";
  sourceFileName?: string;
  summary: string;
  studyGuide: string;
  keyConcepts: string[];
  flashcards: Flashcard[];
  createdAt: string;
  updatedAt: string;
};

export type GenerateStudySetRequest = {
  title: string;
  sourceText?: string;
  sourceType: "text" | "pdf";
  sourceFileName?: string;
};

export type GenerateStudySetResponse = {
  title: string;
  summary: string;
  studyGuide: string;
  keyConcepts: string[];
  flashcards: Array<Pick<Flashcard, "question" | "answer" | "order">>;
};
