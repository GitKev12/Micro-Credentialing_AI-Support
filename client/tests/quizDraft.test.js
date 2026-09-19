import { describe, it, expect } from "@jest/globals";
import { draftIsOpen, restoreQuizDraft } from "../src/pages/student/quizDraft";

/**
 * A kept draft is read against the paper the server sent, never trusted over
 * it: the assessor can change a posted paper between one visit and the next.
 */

const paper = () => ({
  id: "a1",
  items: [
    { id: "q1", choices: [{ id: "a" }, { id: "b" }] },
    { id: "q2", choices: [{ id: "c" }, { id: "d" }] },
    { id: "q3", choices: [{ id: "e" }, { id: "f" }] }
  ]
});

describe("restoreQuizDraft", () => {
  it("puts questions and choices back in the saved order", () => {
    const { assessment } = restoreQuizDraft(paper(), {
      order: ["q3", "q1", "q2"],
      choices: { q1: ["b", "a"] },
      answers: {}
    });

    expect(assessment.items.map((item) => item.id)).toEqual(["q3", "q1", "q2"]);
    expect(assessment.items[1].choices.map((choice) => choice.id)).toEqual(["b", "a"]);
  });

  it("drops what the paper no longer has and adds what is new at the end", () => {
    const { assessment, answers } = restoreQuizDraft(paper(), {
      order: ["q2", "gone", "q1"],
      answers: { q1: "a", q2: "removed-choice", gone: "x" }
    });

    expect(assessment.items.map((item) => item.id)).toEqual(["q2", "q1", "q3"]);
    expect(answers).toEqual({ q1: "a" });
  });

  it("returns to the question the student was on, or the first when it is gone", () => {
    expect(restoreQuizDraft(paper(), { order: ["q1", "q2", "q3"], current: "q2" }).current).toBe(1);
    expect(restoreQuizDraft(paper(), { order: ["q1", "q2", "q3"], current: "gone" }).current).toBe(0);
  });
});

describe("draftIsOpen", () => {
  const mark = { attempt: 2, canRetake: true };

  it("is the attempt while nothing has been handed in", () => {
    expect(draftIsOpen({ order: [], retakeOf: null }, null)).toBe(true);
  });

  it("is a retake in progress when it was started from the mark on record", () => {
    expect(draftIsOpen({ order: [], retakeOf: 2 }, mark)).toBe(true);
  });

  it("was handed in when the mark on record is newer, or there is no retake left", () => {
    expect(draftIsOpen({ order: [], retakeOf: null }, mark)).toBe(false);
    expect(draftIsOpen({ order: [], retakeOf: 1 }, mark)).toBe(false);
    expect(draftIsOpen({ order: [], retakeOf: 2 }, { ...mark, canRetake: false })).toBe(false);
  });
});
