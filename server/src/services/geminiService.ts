import { randomUUID } from "node:crypto";
import type {
  ExamQuestion,
  ExamSession,
  ExamTurnResult,
  EvaluateExamTurnRequest as PublicEvaluateExamTurnRequest,
  EvaluateExamTurnResponse,
  GenerateStudySetResponse,
  StudySet
} from "@automated-study-system/shared";
import { z } from "zod";

import { env } from "../config/env.js";
import { fetchGeminiJson } from "./geminiApi.js";

type PdfInput = {
  title: string;
  sourceType: "pdf";
  sourceFileName?: string;
  extractedText?: string;
  pdfFile: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
  };
};

type TextInput = {
  title: string;
  sourceType: "text";
  sourceText: string;
};

type StudyGenerationInput = TextInput | PdfInput;

type AudioTranscriptionInput = {
  audioFile: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
  };
};

type EvaluateExamTurnInput = Omit<PublicEvaluateExamTurnRequest, "studySetId"> & {
  studySet: StudySet;
};

const studySetSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(10),
  studyGuide: z.string().min(20),
  keyConcepts: z.array(z.string().min(1)).min(3).max(8),
  flashcards: z
    .array(
      z.object({
        question: z.string().min(5),
        answer: z.string().min(1),
        order: z.number().int().positive()
      })
    )
    .min(8)
    .max(12)
});

const examTurnResponseSchema = z.object({
  result: z.object({
    idealAnswer: z.string().min(1),
    feedback: z.string().min(1),
    score: z.number().min(0).max(100),
    classification: z.enum(["strong", "partial", "weak"]),
    weakTopics: z.array(z.string()).max(5)
  }),
  nextQuestion: z
    .object({
      prompt: z.string().min(5),
      focusTopic: z.string().optional()
    })
    .optional(),
  shouldEnd: z.boolean(),
  weakTopics: z.array(z.string()).max(8)
});

const rescueAttemptSchema = z.object({
  concept: z.string().min(1),
  diagnosis: z.string().min(10),
  microLesson: z.string().min(20),
  sourceSupport: z.string().min(10).optional(),
  retryQuestion: z.object({
    prompt: z.string().min(5),
    focusTopic: z.string().optional()
  }),
  idealRetryAnswer: z.string().min(1)
});

const rescueRetryEvaluationSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string().min(1),
  recovered: z.boolean()
});

type GeminiTaskModel = "text" | "multimodal" | "exam" | "rescue";

function getGeminiConfig(task: GeminiTaskModel = "text") {
  const apiKey = env.GEMINI_API_KEY;
  const defaultModel = env.GEMINI_MODEL;
  const model =
    task === "multimodal"
      ? env.GEMINI_MULTIMODAL_MODEL ?? defaultModel
      : task === "exam"
        ? env.GEMINI_EXAM_MODEL ?? env.GEMINI_TEXT_MODEL ?? defaultModel
        : task === "rescue"
          ? env.GEMINI_RESCUE_MODEL ?? env.GEMINI_EXAM_MODEL ?? env.GEMINI_TEXT_MODEL ?? defaultModel
          : env.GEMINI_TEXT_MODEL ?? defaultModel;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Add it to server/.env before generating a study pack.");
  }

  return { apiKey, model };
}

function buildInstructionText(title: string, sourceKind: "text" | "pdf") {
  return [
    "You are generating study material for a single-user learning app.",
    "Return JSON only and follow the response schema exactly.",
    "Create concise, accurate, student-friendly outputs.",
    "The study guide should be structured and easy to review.",
    "Write the study guide as a clean numbered outline.",
    "Each numbered section must start on its own line.",
    "Use short section headings followed by 2-4 concise supporting lines.",
    "Do not collapse the entire study guide into one paragraph.",
    "Do not place multiple numbered sections on the same line.",
    "Flashcards must be active-recall oriented, not vague trivia.",
    "Avoid duplicate flashcards.",
    `Use the exact title provided by the user: ${title}.`,
    `Source kind: ${sourceKind === "pdf" ? "PDF document" : "text notes"}.`
  ].join(" ");
}

function buildTextParts(payload: TextInput) {
  return [
    {
      text: [
        `Title: ${payload.title}`,
        "Task: Generate a study pack from the following source notes.",
        "Requirements:",
        "- summary: 2-4 sentences",
        "- studyGuide: a compact structured guide as a numbered outline",
        "- each numbered section must be on its own line with a short heading and 2-4 supporting lines",
        "- separate sections with blank lines",
        "- keyConcepts: 3-8 short items",
        "- flashcards: 8-12 items",
        "",
        "Source notes:",
        payload.sourceText
      ].join("\n")
    }
  ];
}

function buildPdfParts(payload: PdfInput) {
  return [
    {
      inlineData: {
        mimeType: payload.pdfFile.mimeType,
        data: payload.pdfFile.buffer.toString("base64")
      }
    },
    {
      text: [
        `Title: ${payload.title}`,
        `Original filename: ${payload.pdfFile.fileName}`,
        "Task: Read the PDF and generate a study pack from it.",
        "Requirements:",
        "- summary: 2-4 sentences",
        "- studyGuide: a compact structured guide as a numbered outline",
        "- each numbered section must be on its own line with a short heading and 2-4 supporting lines",
        "- separate sections with blank lines",
        "- keyConcepts: 3-8 short items",
        "- flashcards: 8-12 items",
        "- flashcards must be grounded in the PDF"
      ].join("\n")
    }
  ];
}

function normalizeStudyGuide(studyGuide: string) {
  const normalized = studyGuide
    .replace(/\r\n/g, "\n")
    .replace(/([A-Za-z):])(\d+\.\s)/g, "$1\n$2")
    .replace(/\s+(?=\d+\.\s)/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const sections = normalized
    .split(/\n(?=\d+\.\s)/)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length === 0) {
    return normalized;
  }

  return sections
    .map((section) => section.replace(/\n{2,}/g, "\n").trim())
    .join("\n\n");
}

function truncateForPrompt(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function stripJsonCodeFence(text: string) {
  const trimmed = text.trim();

  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  return trimmed;
}

function parseStructuredResponse<T>(text: string, schema: z.ZodType<T>) {
  return schema.parse(JSON.parse(stripJsonCodeFence(text)) as unknown);
}

function tokenizePromptText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function selectFocusedStudyGuideExcerpt(studySet: StudySet, currentQuestion: ExamQuestion) {
  const sections = studySet.studyGuide
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length === 0) {
    return truncateForPrompt(studySet.studyGuide, 700);
  }

  const needles = [
    currentQuestion.focusTopic ?? "",
    currentQuestion.prompt,
    ...studySet.keyConcepts.slice(0, 5)
  ]
    .join(" ")
    .toLowerCase();

  const relevant = sections.filter((section) => {
    const lowerSection = section.toLowerCase();
    return tokenizePromptText(needles).some((token) => lowerSection.includes(token));
  });

  return truncateForPrompt((relevant.length > 0 ? relevant : sections.slice(0, 2)).slice(0, 2).join("\n\n"), 700);
}

function selectSourceExcerpt(studySet: StudySet, currentQuestion: ExamQuestion) {
  const sourceText = studySet.sourceText.trim();

  if (!sourceText) {
    return "No source text available.";
  }

  const chunks = sourceText
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length === 0) {
    return truncateForPrompt(sourceText, 320);
  }

  const needles = tokenizePromptText(`${currentQuestion.focusTopic ?? ""} ${currentQuestion.prompt}`);
  const relevant = chunks.filter((chunk) => needles.some((token) => chunk.toLowerCase().includes(token)));

  return truncateForPrompt((relevant.length > 0 ? relevant : chunks.slice(0, 1)).join("\n\n"), 320);
}

function formatCompactTurns(turns: ExamTurnResult[]) {
  const recentTurns = turns.slice(-3);

  if (recentTurns.length === 0) {
    return "none";
  }

  return recentTurns
    .map(
      (turn, index) =>
        `Turn ${index + 1}: Q=${truncateForPrompt(turn.question, 80)} | score=${turn.score} | class=${
          turn.classification
        } | weak=${turn.weakTopics.join(", ") || "none"}`
    )
    .join(" || ");
}

function selectExamFlashcardContext(studySet: StudySet, currentQuestion: ExamQuestion) {
  const focusNeedle = `${currentQuestion.focusTopic ?? ""} ${currentQuestion.prompt}`.toLowerCase();
  const relevant = studySet.flashcards.filter((card) => {
    const haystack = `${card.question} ${card.answer}`.toLowerCase();
    return currentQuestion.focusTopic
      ? haystack.includes(currentQuestion.focusTopic.toLowerCase())
      : studySet.keyConcepts.some((concept) => focusNeedle.includes(concept.toLowerCase()) && haystack.includes(concept.toLowerCase()));
  });

  return (relevant.length > 0 ? relevant : studySet.flashcards).slice(0, 4);
}

function buildExamEvaluationSystemPrompt() {
  return [
    "You are an adaptive oral exam coach for a study app.",
    "Grade conceptual understanding rather than exact wording.",
    "Keep feedback concise and actionable.",
    "Return JSON only and follow the response schema exactly.",
    "When the user is weak, ask a follow-up question targeting the weak topic.",
    "When the user is strong and the session has enough coverage, you may end the session.",
    "Use only the provided compact reference context. Do not ask for more information."
  ].join(" ");
}

function buildExamEvaluationUserPrompt(payload: EvaluateExamTurnInput) {
  const compactStudyGuide = selectFocusedStudyGuideExcerpt(payload.studySet, payload.currentQuestion);
  const compactSourceText = selectSourceExcerpt(payload.studySet, payload.currentQuestion);
  const compactFlashcards = selectExamFlashcardContext(payload.studySet, payload.currentQuestion);
  const compactTurns = formatCompactTurns(payload.turns);

  return [
    `Study set title: ${payload.studySet.title}`,
    `Summary: ${payload.studySet.summary}`,
    `Focused study guide excerpt: ${compactStudyGuide}`,
    `Key concepts: ${payload.studySet.keyConcepts.join(", ")}`,
    `Source support excerpt: ${compactSourceText}`,
    `Flashcards: ${compactFlashcards.map((card) => `Q: ${card.question} A: ${card.answer}`).join(" | ")}`,
    `Current question: ${payload.currentQuestion.prompt}`,
    `Current focus topic: ${payload.currentQuestion.focusTopic ?? "none"}`,
    `User answer: ${payload.userAnswer}`,
    `Previous weak topics: ${payload.weakTopics.join(", ") || "none"}`,
    `Previous turns: ${compactTurns}`,
    `Target question count: ${payload.totalQuestionsTarget ?? 5}`,
    "Return:",
    "- result with idealAnswer, feedback, score, classification, weakTopics",
    "- weakTopics merged for ongoing session",
    "- nextQuestion when the session should continue",
    "- shouldEnd boolean"
  ].join("\n");
}

function buildRescueSystemPrompt() {
  return [
    "You are Rescue Mode for a study app.",
    "A learner just struggled with a concept during an oral exam.",
    "Return JSON only.",
    "Give a short diagnosis, a compact recovery lesson, one source-grounded support note, and one simpler retry question.",
    "Keep the tone encouraging and specific.",
    "Do not repeat the full original exam question."
  ].join(" ");
}

function buildRescueUserPrompt(payload: {
  studySet: StudySet;
  session: ExamSession;
  latestTurn: ExamTurnResult;
}) {
  return [
    `Study set title: ${payload.studySet.title}`,
    `Summary: ${payload.studySet.summary}`,
    `Study guide: ${truncateForPrompt(payload.studySet.studyGuide, 1000)}`,
    `Key concepts: ${payload.studySet.keyConcepts.join(", ")}`,
    `Source text: ${truncateForPrompt(payload.studySet.sourceText || "No source text available.", 700)}`,
    `Current weak topics: ${payload.session.weakTopics.join(", ") || "none"}`,
    `Original exam question: ${payload.latestTurn.question}`,
    `User answer: ${payload.latestTurn.userAnswer}`,
    `Ideal answer: ${payload.latestTurn.idealAnswer}`,
    `Feedback already given: ${payload.latestTurn.feedback}`,
    `Detected weak topics: ${payload.latestTurn.weakTopics.join(", ") || "none"}`,
    "Return:",
    "- concept",
    "- diagnosis",
    "- microLesson",
    "- sourceSupport",
    "- retryQuestion with prompt and focusTopic",
    "- idealRetryAnswer"
  ].join("\n");
}

function buildRescueRetrySystemPrompt() {
  return [
    "You are evaluating a Rescue Mode retry answer for a study app.",
    "Be concise and encouraging.",
    "Return JSON only.",
    "Decide whether the learner has now recovered the concept well enough to continue."
  ].join(" ");
}

function buildRescueRetryUserPrompt(payload: {
  studySet: StudySet;
  concept: string;
  microLesson: string;
  retryQuestion: ExamQuestion;
  idealRetryAnswer: string;
  userAnswer: string;
}) {
  return [
    `Study set title: ${payload.studySet.title}`,
    `Concept: ${payload.concept}`,
    `Micro lesson: ${payload.microLesson}`,
    `Retry question: ${payload.retryQuestion.prompt}`,
    `Ideal retry answer: ${payload.idealRetryAnswer}`,
    `User retry answer: ${payload.userAnswer}`,
    "Return:",
    "- score from 0 to 100",
    "- feedback",
    "- recovered boolean"
  ].join("\n");
}

function buildRequestBody(payload: StudyGenerationInput) {
  return {
    systemInstruction: {
      parts: [
        {
          text: buildInstructionText(payload.title, payload.sourceType)
        }
      ]
    },
    contents: [
      {
        role: "user",
        parts: payload.sourceType === "pdf" ? buildPdfParts(payload) : buildTextParts(payload)
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        required: ["title", "summary", "studyGuide", "keyConcepts", "flashcards"],
        properties: {
          title: {
            type: "STRING"
          },
          summary: {
            type: "STRING"
          },
          studyGuide: {
            type: "STRING"
          },
          keyConcepts: {
            type: "ARRAY",
            items: {
              type: "STRING"
            }
          },
          flashcards: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              required: ["question", "answer", "order"],
              properties: {
                question: {
                  type: "STRING"
                },
                answer: {
                  type: "STRING"
                },
                order: {
                  type: "INTEGER"
                }
              }
            }
          }
        }
      }
    }
  };
}

function extractTextResponse(data: unknown): string {
  const parsed = z
    .object({
      candidates: z
        .array(
          z.object({
            content: z.object({
              parts: z.array(
                z.object({
                  text: z.string().optional()
                })
              )
            })
          })
        )
        .min(1)
    })
    .parse(data);

  const text = parsed.candidates[0]?.content.parts.map((part) => part.text ?? "").join("").trim();

  if (!text) {
    throw new Error("Gemini returned no text output.");
  }

  return text;
}

async function generateStudyMaterialsWithGemini(payload: StudyGenerationInput): Promise<GenerateStudySetResponse> {
  const { apiKey, model } = getGeminiConfig(payload.sourceType === "pdf" ? "multimodal" : "text");
  const data = await fetchGeminiJson<unknown>({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    body: buildRequestBody(payload),
    action: "Gemini study generation request",
    priority: "normal"
  });
  const outputText = extractTextResponse(data);
  const parsedStudySet = studySetSchema.parse(JSON.parse(outputText) as unknown);

  return {
    title: payload.title,
    summary: parsedStudySet.summary,
    studyGuide: normalizeStudyGuide(parsedStudySet.studyGuide),
    keyConcepts: parsedStudySet.keyConcepts,
    flashcards: parsedStudySet.flashcards.map((card, index) => ({
      question: card.question,
      answer: card.answer,
      order: card.order ?? index + 1
    }))
  };
}

export async function generateStudyMaterials(payload: StudyGenerationInput): Promise<GenerateStudySetResponse> {
  return generateStudyMaterialsWithGemini(payload);
}

async function evaluateExamTurnWithGemini(payload: EvaluateExamTurnInput): Promise<EvaluateExamTurnResponse> {
  const { apiKey, model } = getGeminiConfig("exam");
  const data = await fetchGeminiJson<unknown>({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    body: {
      systemInstruction: {
        parts: [
          {
            text: buildExamEvaluationSystemPrompt()
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildExamEvaluationUserPrompt(payload)
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          required: ["result", "weakTopics", "shouldEnd"],
          properties: {
            result: {
              type: "OBJECT",
              required: ["idealAnswer", "feedback", "score", "classification", "weakTopics"],
              properties: {
                idealAnswer: { type: "STRING" },
                feedback: { type: "STRING" },
                score: { type: "NUMBER" },
                classification: { type: "STRING", enum: ["strong", "partial", "weak"] },
                weakTopics: { type: "ARRAY", items: { type: "STRING" } }
              }
            },
            nextQuestion: {
              type: "OBJECT",
              properties: {
                prompt: { type: "STRING" },
                focusTopic: { type: "STRING" }
              }
            },
            shouldEnd: { type: "BOOLEAN" },
            weakTopics: { type: "ARRAY", items: { type: "STRING" } }
          }
        }
      }
    },
    action: "Gemini exam evaluation request",
    priority: "high",
    timeoutMs: env.GEMINI_EXAM_TIMEOUT_MS
  });
  const outputText = extractTextResponse(data);
  const parsed = parseStructuredResponse(outputText, examTurnResponseSchema);
  const timestamp = new Date().toISOString();

  return {
    result: {
      questionId: payload.currentQuestion.id,
      question: payload.currentQuestion.prompt,
      focusTopic: payload.currentQuestion.focusTopic,
      userAnswer: payload.userAnswer,
      idealAnswer: parsed.result.idealAnswer,
      feedback: parsed.result.feedback,
      score: parsed.result.score,
      classification: parsed.result.classification,
      weakTopics: parsed.result.weakTopics,
      createdAt: timestamp
    },
    nextQuestion: parsed.nextQuestion
      ? {
          id: randomUUID(),
          prompt: parsed.nextQuestion.prompt,
          focusTopic: parsed.nextQuestion.focusTopic
        }
      : undefined,
    weakTopics: parsed.weakTopics,
    shouldEnd: parsed.shouldEnd
  };
}

export async function evaluateExamTurn(payload: EvaluateExamTurnInput): Promise<EvaluateExamTurnResponse> {
  return evaluateExamTurnWithGemini(payload);
}

export async function transcribeExamAnswer(payload: AudioTranscriptionInput): Promise<string> {
  const { apiKey, model } = getGeminiConfig("multimodal");
  const data = await fetchGeminiJson<unknown>({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    body: {
      systemInstruction: {
        parts: [
          {
            text: [
              "You transcribe spoken answers for an oral exam study app.",
              "Return plain text only.",
              "Do not summarize.",
              "Preserve technical vocabulary and named concepts.",
              "If the audio contains only silence, breaths, room noise, taps, static, or no intelligible speech, return an empty string.",
              "Do not guess, invent, or infer missing words."
            ].join(" ")
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: payload.audioFile.mimeType,
                data: payload.audioFile.buffer.toString("base64")
              }
            },
            {
              text: `Transcribe this oral exam answer from the uploaded audio file: ${payload.audioFile.fileName}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0
      }
    },
    action: "Gemini transcription request",
    priority: "high"
  });
  const transcript = extractTextResponse(data).trim();

  if (!transcript) {
    return "";
  }

  if (/^(?:no\s+(?:speech|audio)\s+detected|silence|inaudible|unintelligible)$/i.test(transcript)) {
    return "";
  }

  return transcript;
}

async function generateRescueAttemptWithGemini(payload: {
  studySet: StudySet;
  session: ExamSession;
  latestTurn: ExamTurnResult;
}) {
  const { apiKey, model } = getGeminiConfig("rescue");
  const data = await fetchGeminiJson<unknown>({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    body: {
      systemInstruction: {
        parts: [
          {
            text: buildRescueSystemPrompt()
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildRescueUserPrompt(payload)
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          required: ["concept", "diagnosis", "microLesson", "retryQuestion", "idealRetryAnswer"],
          properties: {
            concept: { type: "STRING" },
            diagnosis: { type: "STRING" },
            microLesson: { type: "STRING" },
            sourceSupport: { type: "STRING" },
            retryQuestion: {
              type: "OBJECT",
              required: ["prompt"],
              properties: {
                prompt: { type: "STRING" },
                focusTopic: { type: "STRING" }
              }
            },
            idealRetryAnswer: { type: "STRING" }
          }
        }
      }
    },
    action: "Gemini rescue generation request",
    priority: "high"
  });

  const outputText = extractTextResponse(data);
  const parsed = parseStructuredResponse(outputText, rescueAttemptSchema);

  return {
    concept: parsed.concept,
    diagnosis: parsed.diagnosis,
    microLesson: parsed.microLesson,
    sourceSupport: parsed.sourceSupport,
    retryQuestion: {
      id: randomUUID(),
      prompt: parsed.retryQuestion.prompt,
      focusTopic: parsed.retryQuestion.focusTopic
    },
    idealRetryAnswer: parsed.idealRetryAnswer
  };
}

export async function generateRescueAttempt(payload: {
  studySet: StudySet;
  session: ExamSession;
  latestTurn: ExamTurnResult;
}) {
  return generateRescueAttemptWithGemini(payload);
}

async function evaluateRescueRetryWithGemini(payload: {
  studySet: StudySet;
  concept: string;
  microLesson: string;
  retryQuestion: ExamQuestion;
  idealRetryAnswer: string;
  userAnswer: string;
}) {
  const { apiKey, model } = getGeminiConfig("rescue");
  const data = await fetchGeminiJson<unknown>({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    body: {
      systemInstruction: {
        parts: [
          {
            text: buildRescueRetrySystemPrompt()
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildRescueRetryUserPrompt(payload)
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          required: ["score", "feedback", "recovered"],
          properties: {
            score: { type: "NUMBER" },
            feedback: { type: "STRING" },
            recovered: { type: "BOOLEAN" }
          }
        }
      }
    },
    action: "Gemini rescue retry evaluation request",
    priority: "high"
  });

  const outputText = extractTextResponse(data);
  return parseStructuredResponse(outputText, rescueRetryEvaluationSchema);
}

export async function evaluateRescueRetry(payload: {
  studySet: StudySet;
  concept: string;
  microLesson: string;
  retryQuestion: ExamQuestion;
  idealRetryAnswer: string;
  userAnswer: string;
}) {
  return evaluateRescueRetryWithGemini(payload);
}
