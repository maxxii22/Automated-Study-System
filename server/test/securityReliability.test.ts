import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { EvaluateExamTurnResponse, StudySet } from "@automated-study-system/shared";

const originalEnv = { ...process.env };

const testEnv = {
  PORT: "4000",
  CLIENT_ORIGIN: "http://localhost:5173",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  GEMINI_API_KEY: "test-gemini-key",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/study_sphere?schema=public",
  REDIS_URL: "redis://127.0.0.1:6379",
  VERCEL: "1"
};

const canonicalStudySet: StudySet = {
  id: "study-set-1",
  title: "Canonical Biology Set",
  sourceText: "Cells are the fundamental unit of life.",
  sourceType: "text",
  summary: "This set covers cells, organelles, and cellular respiration.",
  studyGuide: "Cells contain organelles. Mitochondria convert nutrients into usable energy for the cell.",
  keyConcepts: ["Cells", "Mitochondria", "Cellular respiration"],
  flashcards: [
    {
      id: "card-1",
      question: "What do mitochondria do?",
      answer: "They generate usable energy through cellular respiration.",
      order: 1
    },
    {
      id: "card-2",
      question: "What is the cell?",
      answer: "The basic structural and functional unit of life.",
      order: 2
    }
  ],
  flashcardCount: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z"
};

const examEvaluationResponse: EvaluateExamTurnResponse = {
  result: {
    questionId: "question-1",
    question: "Explain what mitochondria do.",
    focusTopic: "Mitochondria",
    userAnswer: "They make energy for the cell.",
    idealAnswer: "Mitochondria generate usable energy for the cell through cellular respiration.",
    feedback: "Good start. Mention cellular respiration explicitly next time.",
    score: 82,
    classification: "strong",
    weakTopics: [],
    createdAt: "2026-01-03T00:00:00.000Z"
  },
  nextQuestion: {
    id: "question-2",
    prompt: "Why does cellular respiration matter?",
    focusTopic: "Cellular respiration"
  },
  weakTopics: [],
  shouldEnd: false
};

function applyTestEnv() {
  Object.assign(process.env, testEnv);
}

function buildAuthHeader(userId: string) {
  return `Bearer ${userId}`;
}

function buildCanonicalExamRequest() {
  return {
    studySetId: canonicalStudySet.id,
    currentQuestion: {
      id: "question-1",
      prompt: "Explain what mitochondria do.",
      focusTopic: "Mitochondria"
    },
    userAnswer: "They make energy for the cell.",
    turns: [],
    weakTopics: [],
    totalQuestionsTarget: 5
  };
}

async function createProtectedAppForAuthError() {
  applyTestEnv();
  vi.doMock("../src/lib/logger.js", () => ({
    logError: vi.fn(),
    logInfo: vi.fn()
  }));

  const verifyAccessToken = vi.fn().mockRejectedValue(new Error("Auth upstream unavailable."));
  vi.doMock("../src/services/authService.js", () => ({
    verifyAccessToken
  }));

  const { asyncHandler } = await import("../src/middleware/asyncHandler.js");
  const { requireAuth } = await import("../src/middleware/auth.js");
  const { errorHandler } = await import("../src/middleware/errorHandler.js");

  const app = express();
  app.get("/protected", asyncHandler(requireAuth), (_request, response) => {
    response.json({ ok: true });
  });
  app.use(errorHandler);

  return { app, verifyAccessToken };
}

async function createExamProtectionApp(options?: {
  getStudySetResult?: StudySet | null;
  evaluateImpl?: (payload: unknown) => Promise<EvaluateExamTurnResponse>;
  transcript?: string;
}) {
  applyTestEnv();
  vi.doMock("../src/lib/logger.js", () => ({
    logError: vi.fn(),
    logInfo: vi.fn()
  }));

  const verifyAccessToken = vi.fn(async (accessToken: string) => ({
    id: accessToken,
    email: `${accessToken}@example.com`,
    isAdmin: false
  }));
  const getStudySetResult = options && "getStudySetResult" in options ? options.getStudySetResult : canonicalStudySet;
  const getStudySet = vi.fn(async () => getStudySetResult);
  const evaluateExamTurn = vi.fn(
    options?.evaluateImpl ??
      (async () => {
        return examEvaluationResponse;
      })
  );
  const transcribeExamAnswer = vi.fn(async () => options?.transcript ?? "transcribed answer");

  vi.doMock("../src/services/authService.js", () => ({
    verifyAccessToken
  }));
  vi.doMock("../src/services/studySetRepository.js", () => ({
    getStudySet
  }));
  vi.doMock("../src/services/geminiService.js", () => ({
    evaluateExamTurn,
    transcribeExamAnswer
  }));

  const { asyncHandler } = await import("../src/middleware/asyncHandler.js");
  const { requireAuth } = await import("../src/middleware/auth.js");
  const { errorHandler } = await import("../src/middleware/errorHandler.js");
  const { examRateLimit } = await import("../src/middleware/rateLimit.js");
  const { audioUpload } = await import("../src/middleware/upload.js");
  const { evaluateExamTurnController } = await import("../src/controllers/evaluateExamTurnController.js");
  const { transcribeExamAnswerController } = await import("../src/controllers/transcribeExamAnswerController.js");

  const app = express();
  app.use(express.json());
  app.post("/exam-turn", asyncHandler(requireAuth), examRateLimit, asyncHandler(evaluateExamTurnController));
  app.post(
    "/transcribe-answer",
    asyncHandler(requireAuth),
    examRateLimit,
    audioUpload.single("audioFile"),
    asyncHandler(transcribeExamAnswerController)
  );
  app.use(errorHandler);

  return {
    app,
    mocks: {
      verifyAccessToken,
      getStudySet,
      evaluateExamTurn,
      transcribeExamAnswer
    }
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  Object.assign(process.env, originalEnv, testEnv);
});

afterAll(() => {
  Object.keys(process.env).forEach((key) => {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  });
  Object.assign(process.env, originalEnv);
});

describe("security and reliability hardening", () => {
  it("returns a JSON 500 when auth verification throws", async () => {
    const { app, verifyAccessToken } = await createProtectedAppForAuthError();

    const response = await request(app).get("/protected").set("Authorization", buildAuthHeader("user-1"));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: "Auth upstream unavailable."
    });
    expect(verifyAccessToken).toHaveBeenCalledTimes(1);
  });

  it("evaluates an owned study set using a canonical server lookup", async () => {
    const { app, mocks } = await createExamProtectionApp();

    const response = await request(app)
      .post("/exam-turn")
      .set("Authorization", buildAuthHeader("learner-1"))
      .send(buildCanonicalExamRequest());

    expect(response.status).toBe(200);
    expect(response.body.result.score).toBe(82);
    expect(mocks.getStudySet).toHaveBeenCalledWith("learner-1", canonicalStudySet.id);
    expect(mocks.evaluateExamTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        studySet: canonicalStudySet,
        currentQuestion: expect.objectContaining({ id: "question-1" })
      })
    );
  });

  it("returns 404 when the requested study set is missing or not owned", async () => {
    const { app, mocks } = await createExamProtectionApp({
      getStudySetResult: null
    });

    const response = await request(app)
      .post("/exam-turn")
      .set("Authorization", buildAuthHeader("learner-1"))
      .send(buildCanonicalExamRequest());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      message: "Study set not found."
    });
    expect(mocks.evaluateExamTurn).not.toHaveBeenCalled();
  });

  it("accepts the legacy embedded study set payload but ignores client-supplied content beyond the id", async () => {
    const { app, mocks } = await createExamProtectionApp();

    const response = await request(app)
      .post("/exam-turn")
      .set("Authorization", buildAuthHeader("learner-1"))
      .send({
        studySet: {
          ...canonicalStudySet,
          title: "Injected client title",
          summary: "Injected client summary",
          flashcards: []
        },
        currentQuestion: {
          id: "question-1",
          prompt: "Explain what mitochondria do.",
          focusTopic: "Mitochondria"
        },
        userAnswer: "They make energy for the cell.",
        turns: [],
        weakTopics: [],
        totalQuestionsTarget: 5
      });

    expect(response.status).toBe(200);
    expect(mocks.getStudySet).toHaveBeenCalledWith("learner-1", canonicalStudySet.id);
    expect(mocks.evaluateExamTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        studySet: canonicalStudySet
      })
    );
    expect(mocks.evaluateExamTurn.mock.calls[0]?.[0]).toMatchObject({
      studySet: {
        title: canonicalStudySet.title,
        summary: canonicalStudySet.summary
      }
    });
  });

  it("throttles repeated exam evaluation requests", async () => {
    const { app } = await createExamProtectionApp();

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await request(app)
        .post("/exam-turn")
        .set("Authorization", buildAuthHeader("rate-user"))
        .send(buildCanonicalExamRequest());

      expect(response.status).toBe(200);
    }

    const limitedResponse = await request(app)
      .post("/exam-turn")
      .set("Authorization", buildAuthHeader("rate-user"))
      .send(buildCanonicalExamRequest());

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body).toEqual({
      message: "Too many exam or transcription requests. Please slow down and try again."
    });
  });

  it("throttles repeated transcription requests", async () => {
    const { app } = await createExamProtectionApp();

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await request(app)
        .post("/transcribe-answer")
        .set("Authorization", buildAuthHeader("audio-user"))
        .attach("audioFile", Buffer.from("audio"), {
          filename: "answer.webm",
          contentType: "audio/webm"
        });

      expect(response.status).toBe(200);
    }

    const limitedResponse = await request(app)
      .post("/transcribe-answer")
      .set("Authorization", buildAuthHeader("audio-user"))
      .attach("audioFile", Buffer.from("audio"), {
        filename: "answer.webm",
        contentType: "audio/webm"
      });

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body).toEqual({
      message: "Too many exam or transcription requests. Please slow down and try again."
    });
  });

  it("keys the exam rate limit by authenticated user before falling back to IP", async () => {
    const { app } = await createExamProtectionApp();

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await request(app)
        .post("/exam-turn")
        .set("Authorization", buildAuthHeader("learner-a"))
        .send(buildCanonicalExamRequest());

      expect(response.status).toBe(200);
    }

    const throttledUser = await request(app)
      .post("/exam-turn")
      .set("Authorization", buildAuthHeader("learner-a"))
      .send(buildCanonicalExamRequest());
    const secondUser = await request(app)
      .post("/exam-turn")
      .set("Authorization", buildAuthHeader("learner-b"))
      .send(buildCanonicalExamRequest());

    expect(throttledUser.status).toBe(429);
    expect(secondUser.status).toBe(200);
  });
});
