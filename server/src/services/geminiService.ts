import { randomUUID } from "node:crypto";
import type {
  EvaluateExamTurnRequest,
  EvaluateExamTurnResponse,
  GenerateStudySetResponse
} from "@automated-study-system/shared";
import { z } from "zod";

type PdfInput = {
  title: string;
  sourceType: "pdf";
  sourceFileName?: string;
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

function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

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
        "- studyGuide: a compact structured guide with headings or numbered sections",
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
        "- studyGuide: a compact structured guide with headings or numbered sections",
        "- keyConcepts: 3-8 short items",
        "- flashcards: 8-12 items",
        "- flashcards must be grounded in the PDF"
      ].join("\n")
    }
  ];
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

export async function generateStudyMaterials(
  payload: StudyGenerationInput
): Promise<GenerateStudySetResponse> {
  const { apiKey, model } = getGeminiConfig();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildRequestBody(payload))
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as unknown;
  const outputText = extractTextResponse(data);
  const parsedStudySet = studySetSchema.parse(JSON.parse(outputText) as unknown);

  return {
    title: payload.title,
    summary: parsedStudySet.summary,
    studyGuide: parsedStudySet.studyGuide,
    keyConcepts: parsedStudySet.keyConcepts,
    flashcards: parsedStudySet.flashcards.map((card, index) => ({
      question: card.question,
      answer: card.answer,
      order: card.order ?? index + 1
    }))
  };
}

export async function evaluateExamTurn(
  payload: EvaluateExamTurnRequest
): Promise<EvaluateExamTurnResponse> {
  const { apiKey, model } = getGeminiConfig();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: [
                "You are an adaptive oral exam coach for a study app.",
                "Grade conceptual understanding rather than exact wording.",
                "Keep feedback concise and actionable.",
                "Return JSON only and follow the response schema exactly.",
                "When the user is weak, ask a follow-up question targeting the weak topic.",
                "When the user is strong and the session has enough coverage, you may end the session."
              ].join(" ")
            }
          ]
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  `Study set title: ${payload.studySet.title}`,
                  `Summary: ${payload.studySet.summary}`,
                  `Study guide: ${payload.studySet.studyGuide}`,
                  `Key concepts: ${payload.studySet.keyConcepts.join(", ")}`,
                  `Source text: ${payload.studySet.sourceText || "No source text available."}`,
                  `Flashcards: ${payload.studySet.flashcards.map((card) => `Q: ${card.question} A: ${card.answer}`).join(" | ")}`,
                  `Current question: ${payload.currentQuestion.prompt}`,
                  `Current focus topic: ${payload.currentQuestion.focusTopic ?? "none"}`,
                  `User answer: ${payload.userAnswer}`,
                  `Previous weak topics: ${payload.weakTopics.join(", ") || "none"}`,
                  `Previous turns: ${payload.turns
                    .map(
                      (turn) =>
                        `Question: ${turn.question}; Score: ${turn.score}; Classification: ${turn.classification}; Weak topics: ${
                          turn.weakTopics.join(", ") || "none"
                        }`
                    )
                    .join(" || ") || "none"}`,
                  `Target question count: ${payload.totalQuestionsTarget ?? 5}`,
                  "Return:",
                  "- result with idealAnswer, feedback, score, classification, weakTopics",
                  "- weakTopics merged for ongoing session",
                  "- nextQuestion when the session should continue",
                  "- shouldEnd boolean"
                ].join("\n")
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
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini exam request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as unknown;
  const outputText = extractTextResponse(data);
  const parsed = examTurnResponseSchema.parse(JSON.parse(outputText) as unknown);
  const timestamp = new Date().toISOString();

  return {
    result: {
      questionId: payload.currentQuestion.id,
      question: payload.currentQuestion.prompt,
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

export async function transcribeExamAnswer(payload: AudioTranscriptionInput): Promise<string> {
  const { apiKey, model } = getGeminiConfig();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: [
                "You transcribe spoken answers for an oral exam study app.",
                "Return plain text only.",
                "Do not summarize.",
                "Preserve technical vocabulary and named concepts.",
                "If the speech is unclear, transcribe the best possible interpretation without adding commentary."
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
        ]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini transcription request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as unknown;
  const transcript = extractTextResponse(data).trim();

  if (!transcript) {
    throw new Error("No speech transcript was returned from the recorded answer.");
  }

  return transcript;
}
