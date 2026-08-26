import { describe, it, expect } from "@jest/globals";
import {
  FINAL_ATTEMPT_LIMIT,
  attemptLimitFor,
  currentAttempt,
  retakeState
} from "../src/assessments/assessments.controller.js";

const lesson = { scope: "lesson" };
const final = { scope: "final" };

/** A stored result, in the shape submitAssessment writes. */
const sat = (attempt, extra = {}) => ({ attempt, superseded: false, ...extra });

describe("attemptLimitFor", () => {
  it("caps the final at three sittings", () => {
    expect(FINAL_ATTEMPT_LIMIT).toBe(3);
    expect(attemptLimitFor("final")).toBe(3);
  });

  it("leaves a lesson quiz uncapped", () => {
    // Practice, not examination — and a retake costs no tokens, because the
    // bank was written once and every sitting is drawn from it.
    expect(attemptLimitFor("lesson")).toBe(Infinity);
  });
});

describe("currentAttempt", () => {
  it("picks the latest sitting, whatever order they arrive in", () => {
    const rows = [sat(2), sat(3), sat(1)];
    expect(currentAttempt(rows).attempt).toBe(3);
  });

  it("treats a result written before retakes existed as attempt 1", () => {
    // Those rows carry no `attempt` field at all.
    const legacy = { submittedAt: new Date() };
    expect(currentAttempt([legacy])).toBe(legacy);
    expect(currentAttempt([legacy, sat(2)]).attempt).toBe(2);
  });

  it("is null when nothing has been sat", () => {
    expect(currentAttempt([])).toBeNull();
  });
});

describe("retakeState", () => {
  it("allows a first sitting of anything", () => {
    expect(retakeState(null, final, 0).allowed).toBe(true);
    expect(retakeState(null, lesson, 0).allowed).toBe(true);
  });

  it("lets a lesson quiz be retaken without end", () => {
    expect(retakeState(sat(1), lesson, 1).allowed).toBe(true);
    expect(retakeState(sat(40), lesson, 40).allowed).toBe(true);
  });

  it("allows the second and third sitting of a final, and refuses the fourth", () => {
    expect(retakeState(sat(1), final, 1).allowed).toBe(true);
    expect(retakeState(sat(2), final, 2).allowed).toBe(true);

    const spent = retakeState(sat(3), final, 3);
    expect(spent.allowed).toBe(false);
    expect(spent.reason).toMatch(/all 3 attempts/i);
  });

  it("closes a final once its credential has been issued", () => {
    // The latest attempt is the one that counts, so sitting it again could only
    // take away a credential the student already holds. That is a forfeit, not
    // a retake.
    const issued = sat(1, { credential: { status: "issued" } });
    const state = retakeState(issued, final, 1);

    expect(state.allowed).toBe(false);
    expect(state.reason).toMatch(/credential/i);
  });

  it("does not close a final whose credential is only pending", () => {
    const pending = sat(1, { credential: { status: "pending" } });
    expect(retakeState(pending, final, 1).allowed).toBe(true);
  });
});
