import OpenAI from "openai";
import { getEnvironmentConfig } from "../../config/env.js";
import { ITEM_TYPES, TOS_LEVELS } from "../../assessments/assessments.format.js";

/**
 * Asking a model to write quiz questions.
 *
 * This file is only the call. Everything that decides what a usable question
 * *is* lives in assessments.format.js, and everything that decides when to
 * spend money lives in assessments.generate.js — so the untestable part of the
 * pipeline is kept as small as it can be.
 *
 * ── Why the output shape looks like this ───────────────────────────────────
 * The model is asked for `choices` as plain strings and the answer as an
 * integer index into them. It is not asked for a letter, because a letter has
 * to agree with ids assigned elsewhere, and it is not asked for the answer as
 * text, because then the answer has to be repeated character-for-character to
 * be matchable. An index can only be right or out of range.
 *
 * The previous version of this file asked for `"answer": "<the text>"` while
 * normalizeItem looked for `key` holding a choice id. Nothing matched, so
 * every generated question was discarded — a full-price call returning an
 * empty quiz. Whatever changes here, it has to keep agreeing with
 * mapGeneratedItems in assessments.generate.js.
 */

/** Structured output: the model cannot return a shape that misses these. */
const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "type", "choices", "answerIndex", "level"],
        properties: {
          question: { type: "string" },
          type: { type: "string", enum: ITEM_TYPES },
          choices: {
            type: "array",
            items: { type: "string" }
          },
          answerIndex: { type: "integer" },
          level: { type: "string", enum: TOS_LEVELS }
        }
      }
    }
  }
};

function createOpenAiClient() {
  const { openAiApiKey } = getEnvironmentConfig();

  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return new OpenAI({ apiKey: openAiApiKey });
}

export function getOpenAiIntegrationStatus() {
  const { openAiApiKey, openAiModel } = getEnvironmentConfig();

  return {
    configured: Boolean(openAiApiKey),
    model: openAiModel,
    sdk: "openai"
  };
}

/**
 * The half of the prompt that never changes.
 *
 * Kept separate and sent first so that generating a course's lessons back to
 * back re-uses a cached prefix rather than paying for these instructions
 * thirteen times.
 */
function instructions() {
  return `
You write examination questions for a college course from the lesson material you are given.

Rules:
- Every question must be answerable from the lesson text alone. Invent nothing.
- "answerIndex" is the 0-based position of the correct entry in "choices".
- multiple-choice items need 4 plausible choices. Wrong choices must be wrong, not vague.
- true-false items must have exactly two choices, "True" then "False".
- Never write "All of the above", "None of the above", "Both A and B", or any choice
  that refers to another choice by position. Choices are shuffled before a student
  sees them, which makes those answers meaningless.
- "level" is how the question makes a student think, and must be one of:
  remember (recall a fact), understand (explain it), apply (use it on a new case),
  analyze (break it down or compare), evaluate (judge or justify), create (design something new).
- Vary the questions. Do not ask the same fact twice in different words.
- Write plainly, for a student who has just read the lesson once.
`.trim();
}

/** The half that changes per lesson. */
function lessonPrompt({ courseTitle, moduleTitle, sourceText, itemCount, distribution }) {
  const mix = Object.entries(distribution ?? {})
    .filter(([, count]) => count > 0)
    .map(([level, count]) => `${count} ${level}`)
    .join(", ");

  return `
Course: ${courseTitle}
Lesson: ${moduleTitle}

Write exactly ${itemCount} questions.
${mix ? `Aim for this mix of levels: ${mix}. Scale it up proportionally to reach ${itemCount}.` : ""}
Make roughly one in four a true-false item; the rest multiple-choice.

Lesson material:
"""
${sourceText}
"""
`.trim();
}

/**
 * Returns the model's raw items plus what the call cost. Neither is trusted —
 * the caller maps and validates before anything reaches the database.
 */
export async function generateAssessmentItems({
  courseTitle,
  moduleTitle,
  sourceText,
  itemCount,
  distribution,
  model
}) {
  const client = createOpenAiClient();
  const { openAiModel } = getEnvironmentConfig();
  const chosenModel = model || openAiModel;

  const response = await client.responses.create({
    model: chosenModel,
    instructions: instructions(),
    input: lessonPrompt({ courseTitle, moduleTitle, sourceText, itemCount, distribution }),
    text: {
      format: {
        type: "json_schema",
        name: "assessment_items",
        schema: ITEM_SCHEMA,
        strict: true
      }
    }
  });

  let parsed;
  try {
    parsed = JSON.parse(response.output_text);
  } catch (_error) {
    throw new Error("The model did not return valid JSON.");
  }

  return {
    model: chosenModel,
    items: Array.isArray(parsed?.items) ? parsed.items : [],
    usage: {
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      totalTokens: response.usage?.total_tokens ?? null
    }
  };
}
