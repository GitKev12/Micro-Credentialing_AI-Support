import { describe, it, expect } from "@jest/globals";
import {
  DEFAULT_MINUTES,
  TIMED,
  UNTIMED,
  limitModeFor,
  limitReady,
  timeLimitFor
} from "../src/pages/assessor/timeLimit.js";

/**
 * The one control that decides how long a paper runs: two answers, one of
 * which takes a number.
 */
describe("timeLimitFor", () => {
  it("sends the length beside Timed", () => {
    expect(timeLimitFor({ mode: TIMED, minutes: 45 })).toBe(45);
    expect(timeLimitFor({ mode: TIMED, minutes: "45" })).toBe(45);
    expect(timeLimitFor({ mode: TIMED, minutes: DEFAULT_MINUTES })).toBe(90);
  });

  /**
   * This is the one that was broken twice over. A figure left in the field
   * used to follow the assessor onto the other answer in one direction, and a
   * number they had just typed used to be thrown away in the other.
   */
  it("ignores the field once the paper is untimed", () => {
    expect(timeLimitFor({ mode: UNTIMED, minutes: 45 })).toBeNull();
    expect(timeLimitFor({ mode: UNTIMED })).toBeNull();
  });

  // The field's own ceiling, in case a number arrives past it.
  it("holds the clock to the field's ceiling", () => {
    expect(timeLimitFor({ mode: TIMED, minutes: 900 })).toBe(600);
  });
});

/** Which row an assessor finds already chosen when they open a paper. */
describe("limitModeFor", () => {
  it("reads any length as timed", () => {
    expect(limitModeFor(DEFAULT_MINUTES)).toBe(TIMED);
    expect(limitModeFor(45)).toBe(TIMED);
    expect(limitModeFor(600)).toBe(TIMED);
  });

  /**
   * Null is how the server stores a paper with no clock, since "no limit" and
   * "no time at all" are opposite answers and nought cannot mean both.
   */
  it("reads a paper with no clock as untimed", () => {
    expect(limitModeFor(null)).toBe(UNTIMED);
    expect(limitModeFor(undefined)).toBe(UNTIMED);
    expect(limitModeFor(0)).toBe(UNTIMED);
  });
});

/**
 * Timed with an empty field is the one incomplete state: it would clamp to
 * null and save an untimed paper, which is a different answer from the one
 * showing on screen. The screen stops on it rather than guessing.
 */
describe("limitReady", () => {
  it("stops on Timed with nothing in the field", () => {
    expect(limitReady({ mode: TIMED, minutes: "" })).toBe(false);
    expect(limitReady({ mode: TIMED, minutes: 0 })).toBe(false);
    expect(limitReady({ mode: TIMED, minutes: "soon" })).toBe(false);
    expect(limitReady({ mode: TIMED, minutes: -5 })).toBe(false);
  });

  it("lets a length through, and lets untimed through empty", () => {
    expect(limitReady({ mode: TIMED, minutes: 45 })).toBe(true);
    expect(limitReady({ mode: UNTIMED, minutes: "" })).toBe(true);
  });
});
