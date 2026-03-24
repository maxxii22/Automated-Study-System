export type Flashcard = {
  id: string;
  question: string;
  answer: string;
  order: number;
};

export type ExamQuestion = {
  id: string;
  prompt: string;
  focusTopic?: string;
};

export type ExamTurnResult = {
  questionId: string;
  question: string;
  userAnswer: string;
  idealAnswer: string;
  feedback: string;
  score: number;
  classification: "strong" | "partial" | "weak";
  weakTopics: string[];
  createdAt: string;
};

export type ExamSummary = {
  totalQuestions: number;
  averageScore: number;
  weakTopics: string[];
  strongestTopic?: string;
};

export type ExamSession = {
  id: string;
  studySetId: string;
  startedAt: string;
  completedAt?: string;
  completed: boolean;
  currentQuestion: ExamQuestion;
  turns: ExamTurnResult[];
  weakTopics: string[];
  cumulativeScore: number;
  totalQuestionsTarget: number;
  summary?: ExamSummary;
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

export type EvaluateExamTurnRequest = {
  studySet: StudySet;
  currentQuestion: ExamQuestion;
  userAnswer: string;
  turns: ExamTurnResult[];
  weakTopics: string[];
  totalQuestionsTarget?: number;
};

export type EvaluateExamTurnResponse = {
  result: ExamTurnResult;
  nextQuestion?: ExamQuestion;
  weakTopics: string[];
  shouldEnd: boolean;
};
