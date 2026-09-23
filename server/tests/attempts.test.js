import { describe, it, expect } from "@jest/globals";
import { clockFor, takerCounts } from "../src/assessments/attempts.js";
import { sittingDuration } from "../src/assessments/assessments.controller.js";

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

/**
 * The deadline, which is the server's and not the browser's.
 *
 * A countdown the client worked out for itself would start again at the full
 * hour on every reload. This is the fixed point it counts against: one stamp
 * written when the paper was first asked for, and never rewritten.
 */
describe("clockFor", () => {
  const started = new Date("2026-09-23T09:00:00.000Z");

  it("runs from when the paper was first opened, not from now", () => {
    const clock = clockFor({ startedAt: started, openedAt: new Date("2026-09-23T09:40:00.000Z") }, {
      timeLimitMinutes: 90
    });

    expect(clock.startedAt).toBe("2026-09-23T09:00:00.000Z");
    expect(clock.endsAt).toBe("2026-09-23T10:30:00.000Z");
    expect(clock.limitMinutes).toBe(90);
  });

  it("gives an untimed paper no deadline at all", () => {
    expect(clockFor({ startedAt: started }, { timeLimitMinutes: null })).toBeNull();
    expect(clockFor({ startedAt: started }, { timeLimitMinutes: 0 })).toBeNull();
  });

  /** Rows written before the clock existed have only the one stamp. */
  it("falls back to openedAt where there is no startedAt", () => {
    const clock = clockFor({ openedAt: started }, { timeLimitMinutes: 30 });

    expect(clock.endsAt).toBe("2026-09-23T09:30:00.000Z");
  });

  it("has no deadline to give when the paper was never opened", () => {
    expect(clockFor(null, { timeLimitMinutes: 30 })).toBeNull();
    expect(clockFor({}, { timeLimitMinutes: 30 })).toBeNull();
    expect(clockFor({ startedAt: "not a date" }, { timeLimitMinutes: 30 })).toBeNull();
  });
});

/**
 * How long somebody worked, as the assessor is shown it. The figure is timed
 * by the student's own browser, so it is held to what the paper allowed.
 */
describe("sittingDuration", () => {
  it("keeps a plain figure", () => {
    expect(sittingDuration(20 * 60000, 90)).toBe(20 * 60000);
  });

  it("cannot record a timed paper as having taken longer than it ran", () => {
    expect(sittingDuration(4 * 60 * 60000, 90)).toBe(90 * 60000);
  });

  it("leaves an untimed paper to the outer bound", () => {
    expect(sittingDuration(4 * 60 * 60000, null)).toBe(4 * 60 * 60000);
    expect(sittingDuration(48 * 60 * 60000, null)).toBe(12 * 60 * 60000);
  });

  it("says nothing rather than zero when the client did not time it", () => {
    expect(sittingDuration(undefined, 90)).toBeNull();
    expect(sittingDuration(0, 90)).toBeNull();
    expect(sittingDuration(-5, 90)).toBeNull();
  });
});
