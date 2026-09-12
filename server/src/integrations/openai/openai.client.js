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

/**
 * Structured output: the model cannot return a shape that misses these.
 *
 * `code` is its own field rather than part of the question because a question
 * is shown as one paragraph, and a snippet folded into it arrives as a single
 * line nobody can trace. Strict mode needs every field present, so a question
 * with no code sends "".
 *
 * `explanation` comes before `answerIndex` on purpose. The model writes fields
 * in the order the schema lists them, so it has to say why an answer is right
 * before it commits to which one — the order a person checking their own key
 * would work in.
 */
export const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["level", "question", "code", "type", "choices", "explanation", "answerIndex"],
        properties: {
          level: { type: "string", enum: TOS_LEVELS },
          question: { type: "string" },
          code: { type: "string" },
          type: { type: "string", enum: ITEM_TYPES },
          choices: {
            type: "array",
            items: { type: "string" }
          },
          explanation: { type: "string" },
          answerIndex: { type: "integer" }
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

/**
 * The half of the prompt that never changes.
 *
 * Kept separate and sent first so that generating a course's lessons back to
 * back re-uses a cached prefix rather than paying for these instructions
 * thirteen times.
 *
 * ── Why it reads the way it does ───────────────────────────────────────────
 * The first version opened with "Every question must be answerable from the
 * lesson text alone. Invent nothing." The model obeyed it exactly: papers came
 * back as the lesson read aloud — "according to the lesson…", the lesson's own
 * example characters, its own code copied into the choices — and not one
 * question in seventy asked a student to trace a piece of code. It also only
 * named the six levels, so to meet the blueprint's counts it put "create" and
 * "evaluate" on questions that were recall.
 *
 * The lesson is now the syllabus rather than the script: it decides what may be
 * tested, and the questions are new situations built on it. Each level is tied
 * to a kind of question a student can actually be set, so a level is something
 * the question does rather than a label it wears.
 */
export function instructions() {
  return `
You write examination questions for a college course. The lesson material you are given
is the syllabus: it decides WHAT may be tested. The questions themselves must be new.

What "new" means:
- Build every question on a situation the lesson does not contain: your own code, your own
  variable, method and class names, your own values, your own real-world scenario.
- Never copy or lightly reword the lesson's examples, code samples, stories or character names.
- Never write "according to the lesson", "in the lesson", "as described", "as shown in the
  example", or anything else that sends the student back to the text. A question must stand on
  its own, the way it would on a printed exam.
- Only test ideas the lesson teaches. A student who understood the lesson must be able to
  answer, even though they have never seen this exact code or scenario.

Match each question to its level. The level is what the question makes the student DO:
- remember: recall a term, keyword or rule. Keep these few and short.
- understand: explain what a short new piece of code does, or which description fits a new
  example, in the student's own understanding rather than the lesson's wording.
- apply: OUTPUT TRACING. Give a short new program in "code" and ask what it prints, what a
  variable holds afterwards, or what a call returns. For a lesson without code, apply the idea
  to a new everyday case.
- analyze: ERROR TRACING and step-by-step tracing. Give code with one mistake and ask which line
  will not compile, why it gives the wrong result, or what it prints on a tricky path (a loop's
  last pass, a condition that short-circuits, integer division). For a lesson without code,
  break a new scenario into its parts (which are the objects, the messages, the attributes).
- evaluate: JUDGE. Show two versions of code, or a design decision in a new scenario, and ask
  which one meets a stated requirement and why, or whether a claim about the code is correct.
- create: BUILD. State a new requirement and ask which code, method header, class design or
  sequence of steps meets it. The student chooses the construction; they do not recall one.
If a level's count is zero in the mix you are given, write no questions at that level. Never put
a level on a question that does not ask for that kind of thinking.

Code:
- When the lesson is about programming, most questions above "remember" should be built on code,
  written in the language the lesson uses.
- Put the code in "code", never in "question". Keep it short (usually 3 to 15 lines), complete
  enough to trace, with real line breaks and indentation, and no markdown fences. Use "" when the
  question needs no code.
- The student sees the code with line numbers starting at 1, so "line 4" means the fourth line
  of "code".
- Before choosing the answer, trace the code line by line yourself. The correct choice must be
  exactly what the code really does. If you cannot be certain of the result, write a different
  question. Never rely on behaviour the language leaves undefined.
- Wrong choices should be the mistakes a student really makes: an off-by-one count, integer
  instead of decimal division, = confused with ==, forgetting that && stops early, a missing
  break in a switch.
- Choices are one line each. When the choices would need several lines of code, put the
  candidates in "code" marked // Version A, // Version B and so on, and make the choices
  "Version A", "Version B" and so on.

Every item:
- "explanation": one or two sentences on why the correct choice is correct. Name the answer by
  its content, never by its position or letter, because choices are shuffled.
- "answerIndex" is the 0-based position of the correct entry in "choices".
- multiple-choice items need 4 plausible choices. Wrong choices must be wrong, not vague.
- true-false items must have exactly two choices, "True" then "False". Make them about something
  worth checking, such as a claim about what a piece of code prints.
- Never write "All of the above", "None of the above", "Both A and B", or any choice that refers
  to another choice by position.
- Vary the questions. Do not test the same idea twice in different words.
- Write plainly, for a college student.
`.trim();
}

/** The half that changes per lesson. */
export function lessonPrompt({ courseTitle, moduleTitle, sourceText, itemCount, distribution }) {
  const mix = Object.entries(distribution ?? {})
    .filter(([, count]) => count > 0)
    .map(([level, count]) => `${count} ${level}`)
    .join(", ");

  return `
Course: ${courseTitle}
Lesson: ${moduleTitle}

Write exactly ${itemCount} questions.
${mix ? `Follow this mix of levels from the Table of Specification: ${mix}. Scale it proportionally if it does not add up to ${itemCount}.` : ""}
Make roughly one in four a true-false item; the rest multiple-choice.

Lesson material (the syllabus for these questions, not text to quote):
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
