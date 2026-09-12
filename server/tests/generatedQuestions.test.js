import { describe, it, expect } from "@jest/globals";
import { mapGeneratedItems } from "../src/assessments/assessments.generate.js";
import {
  ITEM_SCHEMA,
  instructions,
  lessonPrompt
} from "../src/integrations/openai/openai.client.js";

/**
 * What the generator asks for, and what it keeps of the answer.
 *
 * None of this calls the model. The request is checked as text and the reply
 * as a hand-written stand-in, which is the only way to test a paid call for
 * free — and the part most likely to drift is exactly this seam between them.
 */

const traced = (overrides = {}) => ({
  level: "apply",
  question: "What does this program print?",
  code: "int count = 0;\nfor (int i = 0; i < 3; i++) {\n    count += 2;\n}\nSystem.out.println(count);",
  type: "multiple-choice",
  choices: ["6", "3", "4", "8"],
  explanation: "The loop runs three times and adds 2 each time, so count ends at 6.",
  answerIndex: 0,
  ...overrides
});

describe("mapGeneratedItems", () => {
  it("keeps the code a question is about, laid out as written", () => {
    const [item] = mapGeneratedItems([traced()]);
    expect(item.code).toBe(
      "int count = 0;\nfor (int i = 0; i < 3; i++) {\n    count += 2;\n}\nSystem.out.println(count);"
    );
    expect(item.key).toBe("a");
  });

  it("keeps the explanation for the assessor", () => {
    const [item] = mapGeneratedItems([traced()]);
    expect(item.explanation).toBe(
      "The loop runs three times and adds 2 each time, so count ends at 6."
    );
  });

  // Strict output makes the model send every field, so a question with no code
  // arrives with "" — which must not be stored as a snippet of nothing.
  it("stores no code for a question that sent an empty one", () => {
    const [item] = mapGeneratedItems([traced({ code: "", level: "remember" })]);
    expect(item).not.toHaveProperty("code");
  });

  it("still drops an answer that is not one of the choices", () => {
    expect(mapGeneratedItems([traced({ answerIndex: 4 })])).toEqual([]);
  });
});

describe("the request", () => {
  const prompt = instructions();

  // The rule that turned every paper into the lesson read back: the model took
  // "invent nothing" to mean no new code, names or situations at all.
  it("no longer forbids new material", () => {
    expect(prompt).not.toMatch(/invent nothing/i);
    expect(prompt).not.toMatch(/answerable from the lesson text alone/i);
  });

  it("tells the model not to send students back to the lesson", () => {
    expect(prompt).toMatch(/according to the lesson/);
    expect(prompt).toMatch(/Never copy or lightly reword the lesson's examples/);
  });

  it("ties the levels to output tracing, error tracing, judging and building", () => {
    expect(prompt).toMatch(/apply: OUTPUT TRACING/);
    expect(prompt).toMatch(/analyze: ERROR TRACING/);
    expect(prompt).toMatch(/evaluate: JUDGE/);
    expect(prompt).toMatch(/create: BUILD/);
  });

  it("passes the blueprint's mix of levels through", () => {
    const text = lessonPrompt({
      courseTitle: "Computer Programming 2",
      moduleTitle: "Looping",
      sourceText: "A while loop repeats while its condition is true.",
      itemCount: 10,
      distribution: { remember: 1, understand: 2, apply: 0, analyze: 3, evaluate: 4, create: 0 }
    });

    expect(text).toMatch(/Write exactly 10 questions/);
    expect(text).toMatch(/1 remember, 2 understand, 3 analyze, 4 evaluate/);
    expect(text).not.toMatch(/0 apply/);
  });

  it("asks for the code and the explanation, the explanation before the answer", () => {
    const item = ITEM_SCHEMA.properties.items.items;
    expect(item.required).toEqual(expect.arrayContaining(["code", "explanation"]));

    // Strict structured output rejects a schema whose required list leaves out
    // a property, so the two must always name the same fields.
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());

    const order = Object.keys(item.properties);
    expect(order.indexOf("explanation")).toBeLessThan(order.indexOf("answerIndex"));
  });
});
