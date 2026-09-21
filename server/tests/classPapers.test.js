import { describe, it, expect } from "@jest/globals";
import {
  paperBelongsToClass,
  paperClassId,
  papersForClass
} from "../src/assessments/classPapers.js";

/**
 * Which paper belongs to which class.
 *
 * A course taught through Section A and Section B has a paper for each, and
 * neither class sits the other's. A paper with no class on it is the course's
 * own — every paper written before classes carried one — and a class with
 * nothing of its own falls back to it, so nothing that was posted stops being
 * posted.
 */

const lesson = (id, moduleId, classId = null) => ({ _id: id, scope: "lesson", moduleId, classId });
const final = (id, classId = null) => ({ _id: id, scope: "final", moduleId: null, classId });

describe("paperClassId and paperBelongsToClass", () => {
  it("reads the class off the paper, as a string or null", () => {
    expect(paperClassId(lesson("a", "m1", "cls-a"))).toBe("cls-a");
    expect(paperClassId(lesson("a", "m1"))).toBeNull();
    expect(paperClassId(undefined)).toBeNull();
  });

  it("gives a class its own paper and the course's, and no other class's", () => {
    expect(paperBelongsToClass(lesson("a", "m1", "cls-a"), "cls-a")).toBe(true);
    expect(paperBelongsToClass(lesson("a", "m1"), "cls-a")).toBe(true);
    expect(paperBelongsToClass(lesson("b", "m1", "cls-b"), "cls-a")).toBe(false);
  });

  // A student on a course with no class behind their enrolment.
  it("gives a student with no class the course's paper only", () => {
    expect(paperBelongsToClass(lesson("a", "m1"), null)).toBe(true);
    expect(paperBelongsToClass(lesson("b", "m1", "cls-b"), null)).toBe(false);
  });
});

describe("papersForClass", () => {
  const shared = lesson("shared-1", "m1");
  const mine = lesson("mine-1", "m1", "cls-a");
  const theirs = lesson("theirs-1", "m1", "cls-b");

  it("prefers the class's own paper over the course's", () => {
    expect(papersForClass([shared, mine, theirs], "cls-a")).toEqual([mine]);
  });

  it("keeps the order of preference whichever order they arrive in", () => {
    expect(papersForClass([mine, shared], "cls-a")).toEqual([mine]);
    expect(papersForClass([shared, mine], "cls-a")).toEqual([mine]);
  });

  it("falls back to the course's paper for a lesson the class has none of", () => {
    const sharedTwo = lesson("shared-2", "m2");
    expect(papersForClass([shared, mine, sharedTwo], "cls-a")).toEqual([mine, sharedTwo]);
  });

  it("never hands over another class's paper", () => {
    expect(papersForClass([theirs], "cls-a")).toEqual([]);
    expect(papersForClass([theirs], null)).toEqual([]);
  });

  it("keeps the final apart from the lessons", () => {
    const rows = papersForClass([final("f-shared"), final("f-mine", "cls-a"), mine], "cls-a");
    expect(rows.map((row) => row._id).sort()).toEqual(["f-mine", "mine-1"]);
  });

  it("gives a course with no classes exactly what it had before", () => {
    const everything = [shared, lesson("shared-2", "m2"), final("f-shared")];
    expect(papersForClass(everything, null)).toEqual(everything);
  });
});
