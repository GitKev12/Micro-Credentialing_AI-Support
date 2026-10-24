import { describe, it, expect } from "@jest/globals";
import {
  blueprintFromTos,
  manualTrueFalse,
  questionTypes
} from "../src/assessments/assessments.blueprint.js";
import { planFinalPaper } from "../src/assessments/assessments.generate.js";
import { lessonPrompt } from "../src/integrations/openai/openai.client.js";

/**
 * How many True or False and Multiple Choice questions a paper gets.
 *
 * The default is the LOTS count as True or False and the HOTS count as
 * Multiple Choice. The assessor can type their own True or False count in the
 * ToS, which wins. Either way it is only a count: a True or False question can
 * be at any level. None of this calls the model.
 */

// The 30/70 split the ToS opens on, for a 60-item paper.
const split60 = { remember: 6, understand: 6, apply: 6, analyze: 14, evaluate: 14, create: 14 };

describe("questionTypes", () => {
  it("defaults to the LOTS count as True or False", () => {
    expect(questionTypes({ itemCount: 60, distribution: split60 })).toEqual({
      trueFalse: 18,
      multipleChoice: 42
    });
  });

  it("scales the default when the paper is a different length", () => {
    expect(questionTypes({ itemCount: 30, distribution: split60 }).trueFalse).toBe(9);
  });

  it("uses the assessor's own count, whatever the levels say", () => {
    expect(questionTypes({ itemCount: 60, distribution: split60, trueFalse: 30 })).toEqual({
      trueFalse: 30,
      multipleChoice: 30
    });
  });

  it("keeps zero as a real answer", () => {
    expect(questionTypes({ itemCount: 10, distribution: split60, trueFalse: 0 }).trueFalse).toBe(0);
  });

  it("never asks for more True or False than the paper holds", () => {
    expect(questionTypes({ itemCount: 5, trueFalse: 9 })).toEqual({
      trueFalse: 5,
      multipleChoice: 0
    });
  });

  it("leaves it to the model when there is nothing to go on", () => {
    expect(questionTypes({ itemCount: 10, distribution: null })).toBeNull();
  });
});

describe("manualTrueFalse", () => {
  it("reads blank as the default", () => {
    expect(manualTrueFalse(null)).toBeNull();
    expect(manualTrueFalse(undefined)).toBeNull();
    expect(manualTrueFalse("")).toBeNull();
    expect(manualTrueFalse("7")).toBe(7);
  });
});

describe("blueprintFromTos — True or False", () => {
  it("carries the count for each lesson and for the final", () => {
    const blueprint = blueprintFromTos({
      rows: [
        { moduleId: "m1", course: "Arrays", remember: 3, analyze: 7, trueFalse: 4 },
        { moduleId: "m2", course: "Looping", remember: 3, analyze: 7 }
      ],
      final: { items: 20, trueFalse: 5, rows: [{ moduleId: "m1", target: 20 }] }
    });

    expect(blueprint.rows.map((row) => row.trueFalse)).toEqual([4, null]);
    expect(blueprint.final.trueFalse).toBe(5);
  });
});

describe("planFinalPaper — True or False", () => {
  const plan = (trueFalse) => ({
    items: 20,
    levels: { remember: 3, understand: 3, apply: 0, analyze: 7, evaluate: 7, create: 0 },
    trueFalse,
    rows: [
      { moduleId: "m1", coverage: "Arrays", target: 10, items: 0 },
      { moduleId: "m2", coverage: "Looping", target: 10, items: 0 }
    ]
  });
  const lessons = [
    { id: "m1", title: "Arrays" },
    { id: "m2", title: "Looping" }
  ];

  it("shares a typed count across the lessons", () => {
    const entries = planFinalPaper({ plan: plan(8), lessons });
    expect(entries.map((entry) => entry.trueFalse)).toEqual([4, 4]);
  });

  it("leaves each lesson on the default when no count was typed", () => {
    const entries = planFinalPaper({ plan: plan(null), lessons });
    expect(entries.map((entry) => entry.trueFalse)).toEqual([null, null]);

    // The whole exam still comes to its 6 LOTS as True or False.
    const total = entries.reduce(
      (sum, entry) =>
        sum + questionTypes({ itemCount: entry.items, distribution: entry.distribution }).trueFalse,
      0
    );
    expect(total).toBe(6);
  });
});

describe("lessonPrompt — question types", () => {
  const base = {
    courseTitle: "Computer Programming 2",
    moduleTitle: "Looping",
    sourceText: "A while loop repeats while its condition is true.",
    itemCount: 10
  };

  it("asks for the exact counts at any level", () => {
    const text = lessonPrompt({ ...base, types: { trueFalse: 3, multipleChoice: 7 } });

    expect(text).toMatch(/Write exactly 3 true-false and 7 multiple-choice items/);
    expect(text).toMatch(/Either type can be at any level/);
    expect(text).not.toMatch(/one in four/);
  });

  it("does not tie True or False to the LOTS levels", () => {
    const text = lessonPrompt({ ...base, types: { trueFalse: 3, multipleChoice: 7 } });
    expect(text).not.toMatch(/apply questions the true-false ones/);
  });

  it("falls back to one in four without counts", () => {
    expect(lessonPrompt(base)).toMatch(/roughly one in four a true-false item/);
  });
});
