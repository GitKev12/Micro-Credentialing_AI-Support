import { describe, it, expect } from "@jest/globals";
import { tallyActivity } from "../src/admin/admin.controller.js";

/**
 * The admin's student list, where badges are counted for every student at once.
 *
 * Two things had gone wrong here and both read as a nought. The badge
 * denominator counted every enrolled course, including one the student takes
 * assess-only — a pathway with no lesson quizzes, and therefore no badges to
 * earn, so those were questions they could never answer. And the pending
 * credential count read `result.credential`, which the query that feeds this
 * never asked the database for.
 */

const COURSES = new Map([
  ["c1", { _id: "c1", courseCode: "CC2", courseName: "Computer Programming 2" }],
  ["c2", { _id: "c2", courseCode: "OOP", courseName: "Object-Oriented Programming" }]
]);

const student = { _id: "s1", student_id: "202300001", enrolledCourses: ["c1", "c2"] };

const lesson = (id, courseId) => ({ _id: id, courseId });
const badge = (moduleId, courseId) => ({ moduleId, courseId, active: true });

const quiz = (id, moduleId, courseId) => ({
  _id: id, courseId, moduleId, scope: "lesson", status: "posted",
  pointsPerItem: 1, totalPoints: 10, passMark: 6,
  items: Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`, q: "?", choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }], key: "a"
  }))
});

const sat = (assessmentId, moduleId, courseId, score, extra = {}) => ({
  studentId: "s1", assessmentId, moduleId, courseId,
  submittedAt: new Date("2026-09-01"), superseded: false,
  aiGrading: { status: "graded", score },
  ...extra
});

const SOURCES = {
  modules: [lesson("m1", "c1"), lesson("m2", "c1"), lesson("m3", "c2"), lesson("m4", "c2")],
  badges: [badge("m1", "c1"), badge("m2", "c1"), badge("m3", "c2"), badge("m4", "c2")],
  assessments: [quiz("a1", "m1", "c1"), quiz("a2", "m2", "c1")],
  progress: [],
  results: [sat("a1", "m1", "c1", 8), sat("a2", "m2", "c1", 3)],
  classes: []
};

const tally = (sources) => tallyActivity([student], COURSES, { ...SOURCES, ...sources }).get("s1");

describe("tallyActivity — what a student's badges are out of", () => {
  it("counts every enrolled course when both are taught", () => {
    // One pass out of two quizzes, against four badges across two courses.
    expect(tally({})).toMatchObject({ badgesEarned: 1, badgesTotal: 4 });
  });

  it("leaves out a course the student takes assess-only", () => {
    // OOP is assess-only for this student: one examination, no lesson
    // quizzes, so its two badges are not theirs to earn and must not stand in
    // the denominator.
    const activity = tally({
      classes: [{ _id: "k1", courseId: "c2", studentIds: ["s1"], mode: "assessOnly" }]
    });

    expect(activity).toMatchObject({ badgesEarned: 1, badgesTotal: 2 });
  });

  it("keeps a taught class's badges where the same student has one of each", () => {
    const activity = tally({
      classes: [
        { _id: "k1", courseId: "c1", studentIds: ["s1"], mode: "taught" },
        { _id: "k2", courseId: "c2", studentIds: ["s1"], mode: "assessOnly" }
      ]
    });

    expect(activity.badgesTotal).toBe(2);
  });

  it("does not take another student's pathway for this one's", () => {
    const activity = tally({
      classes: [{ _id: "k1", courseId: "c2", studentIds: ["someone-else"], mode: "assessOnly" }]
    });

    expect(activity.badgesTotal).toBe(4);
  });

  it("reads a class with no mode as taught", () => {
    const activity = tally({ classes: [{ _id: "k1", courseId: "c2", studentIds: ["s1"] }] });

    expect(activity.badgesTotal).toBe(4);
  });
});

describe("tallyActivity — credentials still waiting on an assessor", () => {
  const passedFinal = (extra) => ({
    ...sat("f1", null, "c1", 40, extra),
    moduleId: null
  });

  it("counts a submission whose credential nobody has released", () => {
    const activity = tally({
      results: [passedFinal({ credential: { status: "pending", name: "CC2 Final Exam Credential" } })]
    });

    expect(activity.pending).toBe(1);
  });

  it("does not count one already issued", () => {
    const activity = tally({
      results: [passedFinal({ credential: { status: "issued", name: "CC2 Final Exam Credential" } })]
    });

    expect(activity.pending).toBe(0);
  });

  it("does not count a retired attempt", () => {
    const activity = tally({
      results: [passedFinal({ superseded: true, credential: { status: "pending", name: "x" } })]
    });

    expect(activity.pending).toBe(0);
  });

  it("says nought rather than undefined when no credential field was stored", () => {
    // Rows written before credentials existed carry none at all.
    expect(tally({}).pending).toBe(0);
  });
});
