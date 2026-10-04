import { describe, it, expect, jest } from "@jest/globals";

/*
 * Lessons open one at a time. Pure rule, no database.
 */

jest.unstable_mockModule("../src/badges/badges.service.js", () => ({ passedLessonQuizzes: async () => new Map() }));
jest.unstable_mockModule("../src/lib/courseAccess.js", () => ({ findCourse: async () => null }));

const { locksFrom } = await import("../src/lib/lessonLocks.js");

const lessons = [
  { _id: "m1", title: "Intro" },
  { _id: "m2", title: "Arrays" },
  { _id: "m3", title: "Loops" },
  { _id: "m4", title: "Methods" }
];

describe("which lessons are open", () => {
  it("opens only the first lesson at the start", () => {
    const locks = locksFrom(lessons, new Set(), new Set());
    expect(locks.get("m1")).toBeNull();
    expect(locks.get("m2")).toBe('Pass the exam for "Intro" to open this lesson.');
    expect(locks.get("m3")).toBeTruthy();
  });

  it("opens the next lesson once the exam before it is passed", () => {
    const locks = locksFrom(lessons, new Set(["m1"]), new Set(["m1"]));
    expect(locks.get("m2")).toBeNull();
    expect(locks.get("m3")).toBeTruthy();
  });

  it("keeps a lesson already finished open, but not the one after an unpassed exam", () => {
    // Read 1–3, passed only exam 1.
    const locks = locksFrom(lessons, new Set(["m1", "m2", "m3"]), new Set(["m1"]));
    expect(locks.get("m3")).toBeNull();
    expect(locks.get("m4")).toBe('Pass the exam for "Loops" to open this lesson.');
  });
});
