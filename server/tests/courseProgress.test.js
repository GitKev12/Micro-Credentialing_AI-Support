import { describe, it, expect } from "@jest/globals";
import { progressSummary } from "../src/courses/courses.controller.js";
import { finalPassedFrom } from "../src/assessors/grading.js";

/**
 * What a course is worth, and how much of it a student has behind them.
 *
 * The figure used to count the reading and nothing else, so a student who had
 * read every lesson was shown a finished course with every paper still to sit.
 * A course is its lessons, a quiz for each of them, and one final.
 *
 * The student's rail runs this same sum on its own copy of the data — see
 * LearningModules.jsx — because a course must not report one figure on its card
 * and a different one inside it. These tests are the shared definition; if they
 * change, that file changes with them.
 */

const summary = (...args) => progressSummary(...args);

describe("what a course is worth", () => {
  it("is its lessons, a quiz for each, and one final", () => {
    // 4 lessons -> 4 + 4 + 1.
    expect(summary(4, 0).itemCount).toBe(9);
    expect(summary(12, 0).itemCount).toBe(25);
    expect(summary(1, 0).itemCount).toBe(3);
  });

  /**
   * What the course owes, not what has been posted. Counting only released
   * papers would drop the percentage each time an assessor posted another one,
   * and progress that falls for something the student did not do is worse than
   * a figure that starts low.
   */
  it("does not depend on how many papers the assessor has released", () => {
    expect(summary(4, 2, 0, false).itemCount).toBe(9);
    expect(summary(4, 2, 4, true).itemCount).toBe(9);
  });

  it("owes nothing at all until a lesson has been published", () => {
    expect(summary(0, 0)).toMatchObject({ itemCount: 0, progress: 0, status: "not-started" });
  });
});

describe("how much of it is done", () => {
  it("counts the lessons read, the quizzes passed and the final", () => {
    // Two lessons read and one quiz passed, out of nine.
    expect(summary(4, 2, 1, false)).toMatchObject({ completedItems: 3, progress: 33 });
  });

  it("counts the final as one more of them", () => {
    expect(summary(4, 4, 4, false).completedItems).toBe(8);
    expect(summary(4, 4, 4, true).completedItems).toBe(9);
  });

  it("keeps the lesson figures alongside, for anything counting the reading", () => {
    expect(summary(4, 3, 1, false)).toMatchObject({ moduleCount: 4, completedModules: 3 });
  });
});

describe("when a course reads as finished", () => {
  /** The whole reason the sum changed. */
  it("is not on the reading alone", () => {
    expect(summary(4, 4, 0, false)).toMatchObject({ progress: 44, status: "in-progress" });
  });

  it("is not with the final still to pass", () => {
    expect(summary(4, 4, 4, false)).toMatchObject({ progress: 89, status: "in-progress" });
  });

  it("is once every lesson, every quiz and the final are behind them", () => {
    expect(summary(4, 4, 4, true)).toMatchObject({ progress: 100, status: "completed" });
  });

  it("has not started until one of the three has been", () => {
    expect(summary(4, 0, 0, false).status).toBe("not-started");
    expect(summary(4, 0, 1, false).status).toBe("in-progress");
    expect(summary(4, 1, 0, false).status).toBe("in-progress");
  });
});

/**
 * The counts come from separate queries, and a course's lessons can be deleted
 * out from under a submission. None of that may push the figure past full.
 */
describe("figures that do not add up", () => {
  it("never counts more quizzes than there are lessons to have them", () => {
    expect(summary(4, 0, 9, false)).toMatchObject({ completedItems: 4, progress: 44 });
  });

  it("never counts more lessons read than there are", () => {
    expect(summary(4, 9, 0, false)).toMatchObject({ completedModules: 4, completedItems: 4 });
  });

  it("never runs past full", () => {
    expect(summary(4, 9, 9, true).completedItems).toBe(9);
    expect(summary(4, 9, 9, true).progress).toBe(100);
  });

  it("treats a negative count as none", () => {
    expect(summary(4, -3, -3, false).completedItems).toBe(0);
    expect(summary(-4, 0, 0, false).itemCount).toBe(0);
  });
});

/**
 * The third of the three things a course is made of.
 *
 * Its lessons are counted off ModuleProgress and its quizzes off the badge
 * module, and both of those already had a home. The final had none, because
 * until the assessor's and the admin's screens ran this same sum nobody had to
 * ask whether a student had passed it.
 */
describe("whether the final has been passed", () => {
  const items = (count) =>
    Array.from({ length: count }, (_unused, index) => ({
      q: `Question ${index + 1}`,
      choices: ["First", "Second"],
      key: "a"
    }));

  // 10 questions at one point each: 10 points, and 6 passes it.
  const FINAL = { _id: "a-final", scope: "final", items: items(10) };
  const QUIZ = { _id: "a-quiz", scope: "lesson", moduleId: "m1", items: items(10) };
  const papers = new Map([
    ["a-final", FINAL],
    ["a-quiz", QUIZ]
  ]);

  const sitting = (assessmentId, score, extra = {}) => ({
    assessmentId,
    aiGrading: { status: "graded", score },
    ...extra
  });

  it("is no when nothing has been taken", () => {
    expect(finalPassedFrom([], papers)).toBe(false);
  });

  it("is yes on a final that cleared its pass mark", () => {
    expect(finalPassedFrom([sitting("a-final", 8)], papers)).toBe(true);
  });

  it("is no on a final that did not", () => {
    expect(finalPassedFrom([sitting("a-final", 5)], papers)).toBe(false);
  });

  /** A lesson quiz is not the final, however well it went. */
  it("does not take a passed quiz for a passed final", () => {
    expect(finalPassedFrom([sitting("a-quiz", 10)], papers)).toBe(false);
  });

  /** A retired attempt decides nothing, here as everywhere else. */
  it("ignores a superseded attempt", () => {
    expect(finalPassedFrom([sitting("a-final", 8, { superseded: true })], papers)).toBe(false);
  });

  it("is yes once any live attempt has passed", () => {
    const attempts = [sitting("a-final", 2), sitting("a-final", 8)];
    expect(finalPassedFrom(attempts, papers)).toBe(true);
  });

  /** A submission whose paper has since been deleted cannot be marked. */
  it("says no rather than throwing when the paper is gone", () => {
    expect(finalPassedFrom([sitting("a-missing", 10)], papers)).toBe(false);
  });
});
