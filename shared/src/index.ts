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

export type ListExamSessionsResponse = {
  items: ExamSession[];
};

export type SaveExamSessionRequest = {
  session: ExamSession;
};

export type SaveExamSessionResponse = {
  session: ExamSession;
};

export type RescueStatus = "open" | "recovered" | "needs_more_help";

export type RescueTriggerType = "exam_turn";

export type RescueAttempt = {
  id: string;
  studySetId: string;
  examSessionId: string;
  triggerType: RescueTriggerType;
  status: RescueStatus;
  sourceQuestionId: string;
  sourceQuestion: string;
  sourceAnswer: string;
  concept: string;
  diagnosis: string;
  microLesson: string;
  sourceSupport?: string;
  retryQuestion: ExamQuestion;
  idealRetryAnswer: string;
  retryUserAnswer?: string;
  retryFeedback?: string;
  retryScore?: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
};

export type ListRescueAttemptsResponse = {
  items: RescueAttempt[];
};

export type CreateRescueAttemptRequest = {
  examSessionId: string;
};

export type CreateRescueAttemptResponse = {
  attempt: RescueAttempt;
};

export type SubmitRescueRetryRequest = {
  userAnswer: string;
};

export type SubmitRescueRetryResponse = {
  attempt: RescueAttempt;
  canResumeExam: boolean;
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
  flashcardCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StudySetListItem = {
  id: string;
  title: string;
  sourceType: "text" | "pdf";
  sourceFileName?: string;
  summary: string;
  keyConcepts: string[];
  flashcardCount: number;
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

export type StudyJobStatus = "queued" | "processing" | "completed" | "failed";

export type StudySetJob = {
  id: string;
  title: string;
  sourceType: "text" | "pdf";
  status: StudyJobStatus;
  stage?: string;
  progressPercent?: number;
  cacheHit: boolean;
  errorCode?: string;
  errorMessage?: string;
  studySetId?: string;
  sourceFileName?: string;
  sourceObjectKey?: string;
  documentHash?: string;
  generatedStudySet?: GenerateStudySetResponse;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type CreateStudyJobRequest =
  | {
      title: string;
      sourceType: "pdf";
      sourceFileName?: string;
    }
  | {
      title: string;
      sourceType: "text";
      sourceText: string;
    };

export type CreateStudyJobResponse = {
  job: StudySetJob;
};

export type GetStudyJobResponse = {
  job: StudySetJob;
};

export type StudyJobOpsSummaryResponse = {
  workerHealthy: boolean;
  staleThresholdMs: number;
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  recentFailedJobs: StudySetJob[];
  stalledJobs: StudySetJob[];
};

export type RetryStudyJobResponse = {
  job: StudySetJob;
  requeued: boolean;
};

export type RecoverStudyJobsResponse = {
  recoveredCount: number;
  jobs: StudySetJob[];
};

export type StudyJobEvent =
  | {
      type: "study-job:queued" | "study-job:progress";
      jobId: string;
      job: StudySetJob;
    }
  | {
      type: "study-job:completed";
      jobId: string;
      job: StudySetJob;
      studySetId?: string;
    }
  | {
      type: "study-job:failed";
      jobId: string;
      job: StudySetJob;
      errorMessage: string;
    };

export type PaginationMeta = {
  nextCursor?: string;
  hasMore: boolean;
};

export type PaginatedStudySetsResponse = {
  items: StudySetListItem[];
  page: PaginationMeta;
};

export type PaginatedFlashcardsResponse = {
  items: Flashcard[];
  page: PaginationMeta;
};

export type DocumentCacheRecord = {
  id: string;
  hash: string;
  sourceFileName?: string;
  sourceObjectKey: string;
  mimeType: string;
  byteSize: number;
  studySetId?: string;
  createdAt: string;
  updatedAt: string;
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
