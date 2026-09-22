import { describe, it, expect } from "@jest/globals";
import { planFinalPaper } from "../src/assessments/assessments.generate.js";

/**
 * How the final divides itself between the lessons.
 *
 * This is the arithmetic the assessor reads on their blueprint and the student
 * reads on their dashboard, and for a long time it was two different sums. A
 * course whose final table gave every lesson a target and left the level cells
 * blank came through as thirteen lessons worth nothing each: the paper was
 * split evenly and the leftover questions went to whichever lessons the
 * database returned first. The assessor's table said this lesson was worth 5
 * and the student's Skill Score was read out of 4, and no screen between them
 * could show which number was the paper's.
 *
 * None of this calls the model. The split is decided before anything is spent,
 * which is the whole reason it is a function of its own.
 */

const M = (n) => `6a4b64f7a6cbd0b379f167${String(n).padStart(2, "0")}`;

const lessons = (count) =>
  Array.from({ length: count }, (_, index) => ({ id: M(index), title: `Lesson ${index + 1}` }));

/** A final table written the common way: a target per lesson, no cells filled. */
const targetsOnly = (targets, levels = null) => ({
  items: targets.reduce((sum, target) => sum + target, 0),
  levels: levels ?? {},
  rows: targets.map((target, index) => ({
    moduleId: M(index),
    coverage: `Lesson ${index + 1}`,
    target,
    items: 0,
    distribution: { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0 }
  }))
});

const totalOf = (plan) => plan.reduce((sum, entry) => sum + entry.items, 0);
const byLesson = (plan) => Object.fromEntries(plan.map((entry) => [entry.coverage, entry.items]));

describe("planFinalPaper — the share each lesson carries", () => {
  it("follows the target column when the level cells are blank", () => {
    // The real OOP table: 60 questions, eight lessons at 5 and five at 4.
    const targets = [5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4];
    const plan = planFinalPaper({ plan: targetsOnly(targets), lessons: lessons(13) });

    expect(plan.map((entry) => entry.items)).toEqual(targets);
    expect(totalOf(plan)).toBe(60);
  });

  it("gives the lesson the assessor said 5 for five questions, not four", () => {
    // The reported fault, as one assertion. Lesson 5 is "Message, Method and
    // More Object Concepts": the blueprint said 5, the paper asked 4.
    const plan = planFinalPaper({
      plan: targetsOnly([5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4]),
      lessons: lessons(13)
    });

    expect(byLesson(plan)["Lesson 5"]).toBe(5);
  });

  it("prefers the level matrix where the assessor filled it in", () => {
    const plan = planFinalPaper({
      plan: {
        items: 20,
        levels: {},
        rows: [
          {
            moduleId: M(0),
            coverage: "Arrays",
            // The two disagree on purpose: the cells are the fuller statement
            // and are what the assessor actually placed.
            target: 4,
            items: 12,
            distribution: { remember: 2, understand: 4, apply: 6, analyze: 0, evaluate: 0, create: 0 }
          },
          {
            moduleId: M(1),
            coverage: "Looping",
            target: 16,
            items: 8,
            distribution: { remember: 0, understand: 0, apply: 0, analyze: 8, evaluate: 0, create: 0 }
          }
        ]
      },
      lessons: lessons(2)
    });

    expect(byLesson(plan)).toEqual({ Arrays: 12, Looping: 8 });
  });

  it("splits evenly only when the table says nothing at all", () => {
    const plan = planFinalPaper({
      plan: { ...targetsOnly([0, 0, 0, 0]), items: 20 },
      lessons: lessons(4)
    });

    expect(plan.map((entry) => entry.items)).toEqual([5, 5, 5, 5]);
  });
});

describe("planFinalPaper — the length that was asked for", () => {
  it("keeps the assessor's typed length and rescales the shares to it", () => {
    // A table adding to 60, asked for as a 30-question paper: every share
    // halves rather than the first thirty lessons taking one each.
    const plan = planFinalPaper({
      plan: targetsOnly([20, 20, 20]),
      lessons: lessons(3),
      wanted: 30
    });

    expect(plan.map((entry) => entry.items)).toEqual([10, 10, 10]);
    expect(totalOf(plan)).toBe(30);
  });

  it("holds the proportions when the shares do not divide the length evenly", () => {
    const plan = planFinalPaper({
      plan: targetsOnly([10, 5, 5]),
      lessons: lessons(3),
      wanted: 21
    });

    expect(totalOf(plan)).toBe(21);
    // 10:5:5 of 21 is 10.5 : 5.25 : 5.25 — the largest fraction takes the odd
    // one, and no lesson is rounded away.
    expect(plan.map((entry) => entry.items)).toEqual([11, 5, 5]);
  });

  it("falls back to the table's own stated length", () => {
    const plan = planFinalPaper({
      plan: { ...targetsOnly([5, 5, 5, 5]), items: 40 },
      lessons: lessons(4)
    });

    expect(totalOf(plan)).toBe(40);
  });

  it("never leaves a lesson off the paper", () => {
    // Four lessons and a five-question paper: the shares say one lesson should
    // take almost all of it, but a lesson with no questions has no Skill Score,
    // and a missing measurement reads on the dashboard as a topic never taught.
    const plan = planFinalPaper({
      plan: targetsOnly([40, 1, 1, 1]),
      lessons: lessons(4),
      wanted: 5
    });

    expect(totalOf(plan)).toBe(5);
    expect(plan).toHaveLength(4);
    expect(plan.every((entry) => entry.items >= 1)).toBe(true);
  });
});

describe("planFinalPaper — lessons that cannot be written from", () => {
  it("drops a lesson with no text and shares its questions out", () => {
    // Three lessons in the table, one of them without extracted text.
    const plan = planFinalPaper({
      plan: targetsOnly([10, 10, 10]),
      lessons: [lessons(3)[0], lessons(3)[2]]
    });

    expect(plan.map((entry) => entry.coverage)).toEqual(["Lesson 1", "Lesson 3"]);
    // The paper stays the length the table asked for rather than coming out
    // ten questions short without saying so.
    expect(totalOf(plan)).toBe(30);
  });

  it("plans nothing when no lesson can be written from", () => {
    expect(planFinalPaper({ plan: targetsOnly([10, 10]), lessons: [] })).toEqual([]);
  });

  it("plans nothing without a final table", () => {
    expect(planFinalPaper({ plan: null, lessons: lessons(3) })).toEqual([]);
  });
});

describe("planFinalPaper — the mix of thinking levels", () => {
  it("puts the examination's stated mix on the paper, to the question", () => {
    // The real OOP table. Its mix asks for 6 apply out of 60, which is half a
    // question in a five-item lesson — and half a question rounded down
    // thirteen times is a paper with no output-tracing on it at all. Sharing
    // the mix out inside each lesson separately did exactly that, so it is
    // dealt across the paper instead.
    const levels = {
      remember: 6,
      understand: 6,
      apply: 6,
      analyze: 14,
      evaluate: 14,
      create: 14
    };

    const plan = planFinalPaper({
      plan: targetsOnly([5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4], levels),
      lessons: lessons(13)
    });

    const onThePaper = Object.fromEntries(
      Object.keys(levels).map((level) => [
        level,
        plan.reduce((sum, entry) => sum + (entry.distribution?.[level] ?? 0), 0)
      ])
    );

    expect(onThePaper).toEqual(levels);
    // And every lesson still carries exactly the questions it was given.
    expect(
      plan.every(
        (entry) =>
          Object.values(entry.distribution).reduce((sum, n) => sum + n, 0) === entry.items
      )
    ).toBe(true);
  });

  it("shares the paper's column totals across a lesson that only stated a count", () => {
    const plan = planFinalPaper({
      plan: targetsOnly([10, 10], {
        remember: 4,
        understand: 4,
        apply: 4,
        analyze: 4,
        evaluate: 2,
        create: 2
      }),
      lessons: lessons(2)
    });

    // 20 questions across those totals, so each lesson of 10 carries half.
    expect(plan[0].distribution).toEqual({
      remember: 2,
      understand: 2,
      apply: 2,
      analyze: 2,
      evaluate: 1,
      create: 1
    });
  });

  it("scales a lesson's own cells to what it ended up carrying", () => {
    const plan = planFinalPaper({
      plan: {
        items: 12,
        levels: {},
        rows: [
          {
            moduleId: M(0),
            coverage: "Arrays",
            target: 0,
            items: 12,
            distribution: { remember: 6, understand: 6, apply: 0, analyze: 0, evaluate: 0, create: 0 }
          }
        ]
      },
      lessons: lessons(1),
      wanted: 6
    });

    expect(plan[0].items).toBe(6);
    expect(plan[0].distribution).toMatchObject({ remember: 3, understand: 3 });
  });

  it("leaves the mix to the model when the table states none", () => {
    const plan = planFinalPaper({ plan: targetsOnly([10, 10]), lessons: lessons(2) });
    expect(plan[0].distribution).toBeNull();
  });
});
