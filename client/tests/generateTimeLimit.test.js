import { describe, it, expect } from "@jest/globals";
import { timeLimitFor } from "../src/pages/assessor/timeLimit.js";

/**
 * The two controls that decide how long a paper runs: a box carrying the
 * department's figure, and a field carrying the assessor's own.
 */
describe("timeLimitFor", () => {
  it("uses the department's figure while the box is ticked", () => {
    expect(timeLimitFor({ timed: true, minutes: 90 })).toBe(90);
    // The field is disabled under the box, so whatever was left in it from
    // before is not what the paper should be given.
    expect(timeLimitFor({ timed: true, minutes: 15 })).toBe(90);
  });

  /**
   * This is the one that was broken. Unticking revealed a Minutes field, took
   * a number, and then sent null regardless — so the only control for setting
   * a clock was the surest way of not setting one.
   */
  it("uses the assessor's own number once they have unticked the box", () => {
    expect(timeLimitFor({ timed: false, minutes: 45 })).toBe(45);
    expect(timeLimitFor({ timed: false, minutes: "45" })).toBe(45);
  });

  /**
   * Nought is how a paper is left with no clock, which is what the field's own
   * minimum is for — and null is how the server stores that, since "no limit"
   * and "no time at all" are opposite answers.
   */
  it("reads nought as no limit rather than as no time", () => {
    expect(timeLimitFor({ timed: false, minutes: 0 })).toBeNull();
    expect(timeLimitFor({ timed: false, minutes: "" })).toBeNull();
    expect(timeLimitFor({ timed: false, minutes: "soon" })).toBeNull();
    expect(timeLimitFor({ timed: false, minutes: -5 })).toBeNull();
  });

  // The field's own ceiling, in case a number arrives past it.
  it("holds the clock to the field's ceiling", () => {
    expect(timeLimitFor({ timed: false, minutes: 900 })).toBe(600);
  });
});
