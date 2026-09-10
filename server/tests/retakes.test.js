import { describe, it, expect } from "@jest/globals";
import {
  FINAL_ATTEMPT_LIMIT,
  attemptLimitFor,
  attemptsUsedFrom,
  currentAttempt,
  retakeState
} from "../src/assessments/assessments.controller.js";

const lesson = { scope: "lesson" };
const final = { scope: "final" };

/** A stored result, in the shape submitAssessment writes. */
const taken = (attempt, extra = {}) => ({ attempt, superseded: false, ...extra });

describe("attemptLimitFor", () => {
  it("caps the final at three attempts", () => {
    expect(FINAL_ATTEMPT_LIMIT).toBe(3);
    expect(attemptLimitFor("final")).toBe(3);
  });

  it("leaves a lesson quiz uncapped", () => {
    // Practice, not examination — and a retake costs no tokens, because the
    // bank was written once and every attempt is drawn from it.
    expect(attemptLimitFor("lesson")).toBe(Infinity);
  });
});

describe("currentAttempt", () => {
  it("picks the latest attempt, whatever order they arrive in", () => {
    const rows = [taken(2), taken(3), taken(1)];
    expect(currentAttempt(rows).attempt).toBe(3);
  });

  it("treats a result written before retakes existed as attempt 1", () => {
    // Those rows carry no `attempt` field at all.
    const legacy = { submittedAt: new Date() };
    expect(currentAttempt([legacy])).toBe(legacy);
    expect(currentAttempt([legacy, taken(2)]).attempt).toBe(2);
  });

  it("is null when nothing has been taken", () => {
    expect(currentAttempt([])).toBeNull();
  });
});

describe("retakeState", () => {
  it("allows a first attempt at anything", () => {
    expect(retakeState(null, final, 0).allowed).toBe(true);
    expect(retakeState(null, lesson, 0).allowed).toBe(true);
  });

  it("lets a lesson quiz be retaken without end", () => {
    expect(retakeState(taken(1), lesson, 1).allowed).toBe(true);
    expect(retakeState(taken(40), lesson, 40).allowed).toBe(true);
  });

  it("allows the second and third attempt at a final, and refuses the fourth", () => {
    expect(retakeState(taken(1), final, 1).allowed).toBe(true);
    expect(retakeState(taken(2), final, 2).allowed).toBe(true);

    const spent = retakeState(taken(3), final, 3);
    expect(spent.allowed).toBe(false);
    expect(spent.reason).toMatch(/all 3 attempts/i);
  });

  it("closes a final once its credential has been issued", () => {
    // The latest attempt is the one that counts, so taking it again could only
    // take away a credential the student already holds. That is a forfeit, not
    // a retake.
    const issued = taken(1, { credential: { status: "issued" } });
    const state = retakeState(issued, final, 1);

    expect(state.allowed).toBe(false);
    expect(state.reason).toMatch(/credential/i);
  });

  it("does not close a final whose credential is only pending", () => {
    const pending = taken(1, { credential: { status: "pending" } });
    expect(retakeState(pending, final, 1).allowed).toBe(true);
  });
});

/**
 * How many takes sit behind a paper — the number the student's rail reports as
 * used, and now the number the assessor's student page turns into a retake
 * count. One definition, so the two screens cannot disagree about how many goes
 * somebody has had.
 */
describe("attemptsUsedFrom", () => {
  it("counts the rows kept for a paper", () => {
    expect(attemptsUsedFrom([taken(1), taken(2), taken(3)])).toBe(3);
  });

  it("is nought when the paper has never been taken", () => {
    expect(attemptsUsedFrom([])).toBe(0);
    expect(attemptsUsedFrom(undefined)).toBe(0);
  });

  it("counts a row written before retakes existed as the one take it was", () => {
    // Those rows carry no `attempt` field at all.
    expect(attemptsUsedFrom([{ submittedAt: new Date() }])).toBe(1);
  });

  it("trusts the highest attempt number over a history missing a row", () => {
    // A third attempt whose first row has gone is still a third attempt, and
    // reporting two would hand back a go the student has already used.
    expect(attemptsUsedFrom([taken(2), taken(3)])).toBe(3);
  });

  it("takes the live row into account when it has no history beside it", () => {
    expect(attemptsUsedFrom([], taken(2))).toBe(2);
    expect(attemptsUsedFrom([taken(1)], taken(2))).toBe(2);
  });

  it("never reads below the number of rows it was given", () => {
    // Two rows are two takes even if neither says which it was.
    expect(attemptsUsedFrom([{}, {}])).toBe(2);
  });
});
