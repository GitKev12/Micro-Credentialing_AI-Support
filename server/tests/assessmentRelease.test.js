import { describe, it, expect } from "@jest/globals";
import { lockStateFor, unreleasedReason } from "../src/assessments/assessments.controller.js";
import {
  DEFAULT_FINAL_MINUTES,
  assessmentStatus,
  isPosted,
  normalizeAssessment,
  normalizeMinutes
} from "../src/assessments/assessments.format.js";

/**
 * Releasing a paper is the assessor's act.
 *
 * A generated quiz is a draft until an assessor reads it and posts it to the
 * course; only then does any student see it. These cover the two halves of
 * that: what "posted" means on a stored document, and what the student's gate
 * does with it.
 */

const item = (id) => ({
  id,
  q: `Question ${id}`,
  choices: [
    { id: "a", text: "Right" },
    { id: "b", text: "Wrong" }
  ],
  key: "a"
});

/** A stored Assessment, in the shape the generator writes. */
const paper = (extra = {}) => ({
  _id: "a1",
  courseId: "c1",
  moduleId: "m1",
  scope: "lesson",
  title: "Lesson 1 Quiz",
  itemsPerAttempt: 1,
  items: [item("g1"), item("g2")],
  ...extra
});

/** The slice of loadCourseState that lockStateFor actually reads. */
const state = ({ done = [], modules = [], assessments = [], results = new Map() } = {}) => ({
  completedModuleIds: new Set(done.map(String)),
  modules,
  assessments,
  resultByAssessment: results
});

describe("assessmentStatus", () => {
  it("reads a document written before posting existed as posted", () => {
    // Those papers were live the moment they existed — a student pressing
    // "Take the Quiz" is what wrote them. Treating a missing status as a draft
    // would shut every existing course's quizzes on deploy.
    expect(assessmentStatus({})).toBe("posted");
    expect(isPosted({})).toBe(true);
  });

  it("holds a draft shut and lets a posted paper through", () => {
    expect(isPosted({ status: "draft" })).toBe(false);
    expect(isPosted({ status: "posted" })).toBe(true);
  });
});

describe("normalizeMinutes", () => {
  it("keeps a positive number of minutes, in whichever form it arrives", () => {
    expect(normalizeMinutes(60)).toBe(DEFAULT_FINAL_MINUTES);
    expect(normalizeMinutes("45")).toBe(45);
    expect(normalizeMinutes(45.7)).toBe(45);
  });

  it("reads anything else as untimed rather than as no time at all", () => {
    expect(normalizeMinutes(0)).toBeNull();
    expect(normalizeMinutes(-5)).toBeNull();
    expect(normalizeMinutes(null)).toBeNull();
    expect(normalizeMinutes("soon")).toBeNull();
  });
});

describe("normalizeAssessment", () => {
  it("carries the release state and the clock onto the normalised paper", () => {
    const normalized = normalizeAssessment(paper({ status: "draft", timeLimitMinutes: 30 }));
    expect(normalized.status).toBe("draft");
    expect(normalized.timeLimitMinutes).toBe(30);
  });
});

describe("lockStateFor", () => {
  it("shuts an unposted quiz whatever the student has finished", () => {
    const draft = paper({ status: "draft" });
    const lock = lockStateFor(draft, state({ done: ["m1"] }));

    expect(lock.locked).toBe(true);
    expect(lock.reason).toBe("Your assessor will unlock this quiz.");
  });

  it("names the final assessment when the final is the paper being held back", () => {
    const draft = paper({ _id: "f1", moduleId: null, scope: "final", status: "draft" });
    expect(lockStateFor(draft, state()).reason).toBe(
      "Your assessor will unlock this final assessment."
    );
    expect(unreleasedReason("final")).toBe("Your assessor will unlock this final assessment.");
  });

  it("still requires the lesson to be finished once the quiz is posted", () => {
    const posted = paper({ status: "posted" });

    expect(lockStateFor(posted, state({ done: [] }))).toEqual({
      locked: true,
      reason: "Finish this lesson to unlock its quiz."
    });
    expect(lockStateFor(posted, state({ done: ["m1"] }))).toEqual({
      locked: false,
      reason: null
    });
  });

  it("counts only posted quizzes against the final's gate", () => {
    // A draft is the assessor's working copy. Demanding a pass in a paper
    // nobody can open would shut the final for good.
    const draftQuiz = paper({ _id: "a1", moduleId: "m1", status: "draft" });
    const final = paper({ _id: "f1", moduleId: null, scope: "final", status: "posted" });

    const lock = lockStateFor(
      final,
      state({
        done: ["m1"],
        modules: [{ _id: "m1" }],
        assessments: [draftQuiz, final]
      })
    );

    expect(lock).toEqual({ locked: false, reason: null });
  });

  it("holds the final until every posted lesson quiz has been passed", () => {
    const quiz = paper({ _id: "a1", moduleId: "m1", status: "posted", passMark: 1 });
    const final = paper({ _id: "f1", moduleId: null, scope: "final", status: "posted" });

    const failed = new Map([["a1", { aiGrading: { score: 0 } }]]);
    const shut = lockStateFor(
      final,
      state({ done: ["m1"], modules: [{ _id: "m1" }], assessments: [quiz, final], results: failed })
    );
    expect(shut.locked).toBe(true);
    expect(shut.reason).toBe("Complete 1 quiz to unlock the final assessment.");

    const passed = new Map([["a1", { aiGrading: { score: 1 } }]]);
    const open = lockStateFor(
      final,
      state({ done: ["m1"], modules: [{ _id: "m1" }], assessments: [quiz, final], results: passed })
    );
    expect(open).toEqual({ locked: false, reason: null });
  });
});
