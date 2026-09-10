import { describe, it, expect } from "@jest/globals";
import { takerCounts } from "../src/assessments/attempts.js";

/**
 * The four numbers under a posted paper. The whole point of them is that the
 * last three are exclusive and add up to the first — read as one row, they say
 * how far across the class a paper has got, and two cards counting the same
 * person would make that arithmetic a lie.
 */
describe("takerCounts", () => {
  const students = 12;

  it("puts everyone in not-started while the paper is untouched", () => {
    expect(takerCounts({ students })).toEqual({
      all: 12,
      notStarted: 12,
      inProgress: 0,
      submitted: 0
    });
  });

  it("divides the class between the three states", () => {
    const counts = takerCounts({
      students,
      submitted: new Set(["s1", "s2", "s3"]),
      open: new Set(["s4", "s5"])
    });

    expect(counts).toEqual({ all: 12, notStarted: 7, inProgress: 2, submitted: 3 });
    expect(counts.notStarted + counts.inProgress + counts.submitted).toBe(counts.all);
  });

  /**
   * A retake is a student opening a paper they have already handed in. They
   * have submitted it — that is the fact about them — so counting them under
   * both would put thirteen people in a class of twelve.
   */
  it("counts somebody retaking as submitted, not as both", () => {
    const counts = takerCounts({
      students,
      submitted: new Set(["s1", "s2"]),
      open: new Set(["s1", "s7"])
    });

    expect(counts).toEqual({ all: 12, notStarted: 9, inProgress: 1, submitted: 2 });
    expect(counts.notStarted + counts.inProgress + counts.submitted).toBe(counts.all);
  });

  it("holds when the whole class is working at once", () => {
    const open = new Set(Array.from({ length: 12 }, (_, i) => `s${i}`));
    expect(takerCounts({ students, open })).toEqual({
      all: 12,
      notStarted: 0,
      inProgress: 12,
      submitted: 0
    });
  });

  /**
   * More submissions than students is a real state, not a bug: a student can
   * hand a paper in and be dropped from the course afterwards, and their result
   * stays on record. Not-started must not go negative and start reading as a
   * number of people.
   */
  it("never counts a negative number of people", () => {
    const counts = takerCounts({
      students: 2,
      submitted: new Set(["s1", "s2", "gone"]),
      open: new Set(["also-gone"])
    });

    expect(counts.notStarted).toBe(0);
    expect(counts.submitted).toBe(3);
    expect(counts.all).toBe(2);
  });

  // A course nobody is enrolled on, and a paper read before either set has
  // been fetched. Neither is an error; both are zero.
  it("survives being asked about nothing", () => {
    expect(takerCounts()).toEqual({ all: 0, notStarted: 0, inProgress: 0, submitted: 0 });
    expect(takerCounts({ students: 0, submitted: new Set(), open: new Set() })).toEqual({
      all: 0,
      notStarted: 0,
      inProgress: 0,
      submitted: 0
    });
  });

  // The callers pass whatever the read produced, which is null when the
  // collection does not exist yet — the first course on a fresh database.
  it("treats a missing set as nobody", () => {
    expect(takerCounts({ students: 4, submitted: null, open: null })).toMatchObject({
      notStarted: 4,
      inProgress: 0,
      submitted: 0
    });
  });
});
