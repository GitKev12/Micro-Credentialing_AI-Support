import OpenAI from "openai";
import { getEnvironmentConfig } from "../../config/env.js";

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

function buildAssessmentPrompt({
  courseTitle,
  moduleTitle,
  moduleSummary,
  moduleOutcomes,
  difficulty,
  questionCount
}) {
  return `
You are generating an assessment for a student enrolled in a course module.

Return valid JSON only with this exact shape:
{
  "title": "string",
  "instructions": "string",
  "questions": [
    {
      "question": "string",
      "type": "multiple_choice",
      "choices": ["string", "string", "string", "string"],
      "answer": "string",
      "explanation": "string",
      "outcome": "string"
    }
  ]
}

Rules:
- Generate exactly ${questionCount} multiple choice questions.
- Base every question on the module content and intended outcomes.
- Use clear language for students.
- Make the difficulty ${difficulty}.
- Each question must have 4 choices.
- The "answer" value must exactly match one entry from "choices".
- The "outcome" must map to one of the provided learning outcomes.
- Do not include markdown fences or extra text.

Course title: ${courseTitle}
Module title: ${moduleTitle}
Module summary: ${moduleSummary}
Learning outcomes:
${moduleOutcomes.map((outcome, index) => `${index + 1}. ${outcome}`).join("\n")}
`.trim();
}

function parseAssessmentJson(outputText) {
  try {
    return JSON.parse(outputText);
  } catch (error) {
    throw new Error("OpenAI response did not return valid JSON.");
  }
}

export async function generateAssessmentFromModule(input) {
  const client = createOpenAiClient();
  const { openAiModel } = getEnvironmentConfig();

  const response = await client.responses.create({
    model: openAiModel,
    input: buildAssessmentPrompt(input)
  });

  return {
    model: openAiModel,
    assessment: parseAssessmentJson(response.output_text)
  };
}
