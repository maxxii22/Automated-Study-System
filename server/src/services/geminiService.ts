import type { GenerateStudySetResponse } from "@automated-study-system/shared";
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
