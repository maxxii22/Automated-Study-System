import { randomUUID } from "node:crypto";

import type {
  ExamEvaluationOutcome,
  ExamQuestion,
  StudySet
} from "@automated-study-system/shared";

type EvaluateExamTurnInput = {
  currentQuestion: ExamQuestion;
  userAnswer: string;
  turns: Array<{
    questionId: string;
    question: string;
    focusTopic?: string;
    userAnswer: string;
    idealAnswer: string;
    feedback: string;
    score: number;
    classification: "strong" | "partial" | "weak";
    weakTopics: string[];
    createdAt: string;
  }>;
  weakTopics: string[];
  totalQuestionsTarget?: number;
  studySet: StudySet;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "their",
  "there",
  "these",
  "this",
  "to",
  "was",
  "we",
  "with",
  "your"
]);

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function uniqueTokens(text: string) {
  return [...new Set(tokenize(text))];
}

function sentenceCase(text: string) {
  if (!text) {
    return text;
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildReferenceContext(studySet: StudySet, currentQuestion: ExamQuestion) {
  const focusText = [currentQuestion.focusTopic ?? "", currentQuestion.prompt, ...studySet.keyConcepts].join(" ").toLowerCase();
  const relevantFlashcards = studySet.flashcards
    .filter((card) => {
      const haystack = `${card.question} ${card.answer}`.toLowerCase();
      return currentQuestion.focusTopic
        ? haystack.includes(currentQuestion.focusTopic.toLowerCase())
        : studySet.keyConcepts.some((concept) => focusText.includes(concept.toLowerCase()) && haystack.includes(concept.toLowerCase()));
    })
    .slice(0, 3);

  const fallbackFlashcards = relevantFlashcards.length > 0 ? relevantFlashcards : studySet.flashcards.slice(0, 3);

  return [
    currentQuestion.prompt,
    currentQuestion.focusTopic ?? "",
    studySet.summary,
    ...fallbackFlashcards.flatMap((card) => [card.question, card.answer]),
    ...studySet.keyConcepts.slice(0, 5)
  ]
    .filter(Boolean)
    .join(" ");
}

function computeMissingConcepts(studySet: StudySet, currentQuestion: ExamQuestion, answerTokens: string[]) {
  const lowerAnswer = answerTokens.join(" ");
  const conceptCandidates = [
    ...(currentQuestion.focusTopic ? [currentQuestion.focusTopic] : []),
    ...studySet.keyConcepts
  ];
  const concepts = [...new Set(conceptCandidates)];

  return concepts.filter((concept) => {
    const conceptTokens = tokenize(concept);

    if (conceptTokens.length === 0) {
      return false;
    }

    return !conceptTokens.every((token) => lowerAnswer.includes(token));
  });
}

function mergeWeakTopics(existingWeakTopics: string[], newWeakTopics: string[]) {
  return [...new Set([...existingWeakTopics, ...newWeakTopics])].slice(0, 8);
}

function classifyScore(score: number): "strong" | "partial" | "weak" {
  if (score >= 80) {
    return "strong";
  }

  if (score >= 55) {
    return "partial";
  }

  return "weak";
}

function buildFallbackFeedback(input: {
  classification: "strong" | "partial" | "weak";
  missingConcepts: string[];
  currentQuestion: ExamQuestion;
}) {
  const lead = "Quick score while live AI evaluation is busy:";

  if (input.classification === "strong") {
    return `${lead} your answer covers the main idea clearly. Keep using the key terms and linking them back to ${input.currentQuestion.focusTopic ?? "the topic"}.`;
  }

  if (input.classification === "partial") {
    return `${lead} you have part of the idea, but you should make the connection to ${sentenceCase(
      input.missingConcepts[0] ?? input.currentQuestion.focusTopic ?? "the missing concept"
    )} more explicit.`;
  }

  return `${lead} your answer needs the core idea around ${sentenceCase(
    input.missingConcepts[0] ?? input.currentQuestion.focusTopic ?? "this concept"
  )}. Focus on the cause, role, or definition more directly.`;
}

function buildIdealAnswer(studySet: StudySet, currentQuestion: ExamQuestion) {
  const relevantFlashcard = studySet.flashcards.find((card) => {
    const haystack = `${card.question} ${card.answer}`.toLowerCase();
    return currentQuestion.focusTopic
      ? haystack.includes(currentQuestion.focusTopic.toLowerCase())
      : haystack.includes(currentQuestion.prompt.toLowerCase().split(" ").slice(0, 3).join(" "));
  });

  return truncate(relevantFlashcard?.answer ?? studySet.summary, 280);
}

function buildNextQuestion(payload: EvaluateExamTurnInput, classification: "strong" | "partial" | "weak", weakTopics: string[]): ExamQuestion | undefined {
  if (classification !== "strong" && weakTopics[0]) {
    return {
      id: randomUUID(),
      prompt: `In one or two sentences, explain ${weakTopics[0]} more clearly in the context of ${payload.studySet.title}.`,
      focusTopic: weakTopics[0]
    };
  }

  const coveredTopics = new Set(
    payload.turns
      .flatMap((turn) => turn.weakTopics)
      .concat(payload.currentQuestion.focusTopic ? [payload.currentQuestion.focusTopic] : [])
      .map((topic) => topic.toLowerCase())
  );

  const nextTopic = payload.studySet.keyConcepts.find((concept) => !coveredTopics.has(concept.toLowerCase()));

  if (!nextTopic) {
    return undefined;
  }

  return {
    id: randomUUID(),
    prompt: `Explain why ${nextTopic} matters in ${payload.studySet.title}.`,
    focusTopic: nextTopic
  };
}

export function evaluateExamTurnLocally(payload: EvaluateExamTurnInput): ExamEvaluationOutcome {
  const answerTokens = uniqueTokens(payload.userAnswer);
  const referenceTokens = uniqueTokens(buildReferenceContext(payload.studySet, payload.currentQuestion));
  const matchingTokens = answerTokens.filter((token) => referenceTokens.includes(token));
  const overlapScore = referenceTokens.length > 0 ? matchingTokens.length / Math.min(referenceTokens.length, 18) : 0;
  const lengthScore = Math.min(answerTokens.length / 18, 1);
  const missingConcepts = computeMissingConcepts(payload.studySet, payload.currentQuestion, answerTokens);
  const conceptCoverage =
    (currentQuestionConceptCount(payload) - Math.min(missingConcepts.length, currentQuestionConceptCount(payload))) /
    Math.max(currentQuestionConceptCount(payload), 1);

  let score = Math.round(lengthScore * 25 + overlapScore * 50 + conceptCoverage * 25);

  if (answerTokens.length <= 2) {
    score = Math.min(score, 28);
  }

  const classification = classifyScore(score);
  const weakTopics = mergeWeakTopics(
    payload.weakTopics,
    classification === "strong"
      ? []
      : missingConcepts.slice(0, 3).length > 0
        ? missingConcepts.slice(0, 3)
        : payload.currentQuestion.focusTopic
          ? [payload.currentQuestion.focusTopic]
          : payload.studySet.keyConcepts.slice(0, 2)
  );
  const nextQuestion = buildNextQuestion(payload, classification, weakTopics);
  const totalQuestionsTarget = payload.totalQuestionsTarget ?? 5;
  const shouldEnd = payload.turns.length + 1 >= totalQuestionsTarget || (!nextQuestion && classification === "strong");
  const timestamp = new Date().toISOString();

  return {
    result: {
      questionId: payload.currentQuestion.id,
      question: payload.currentQuestion.prompt,
      focusTopic: payload.currentQuestion.focusTopic,
      userAnswer: payload.userAnswer,
      idealAnswer: buildIdealAnswer(payload.studySet, payload.currentQuestion),
      feedback: buildFallbackFeedback({
        classification,
        missingConcepts,
        currentQuestion: payload.currentQuestion
      }),
      score,
      classification,
      weakTopics,
      createdAt: timestamp
    },
    nextQuestion,
    weakTopics,
    shouldEnd
  };
}

function currentQuestionConceptCount(payload: EvaluateExamTurnInput) {
  const concepts = [
    ...(payload.currentQuestion.focusTopic ? [payload.currentQuestion.focusTopic] : []),
    ...payload.studySet.keyConcepts.slice(0, 4)
  ];

  return [...new Set(concepts.map((concept) => concept.toLowerCase()))].length;
}
