import { describe, it, expect } from "@jest/globals";

import {
  LOW_TIME_MS,
  clockFace,
  durationLabel,
  shortDuration,
  spokenTimeLeft
} from "../src/pages/student/assessmentClock";

/**
 * Two readings of the same number.
 *
 * Before the paper is turned over the length is a plan, and you say it the way
 * you would say it out loud when working out whether you have time for it.
 * Once it is running it is a countdown, read at a glance under pressure, and
 * that wants digits.
 */

describe("durationLabel — how long the paper runs", () => {
  it("says minutes under the hour", () => {
    expect(durationLabel(45)).toBe("45 minutes");
    expect(durationLabel(1)).toBe("1 minute");
  });

  it("says hours on the hour, with no trailing nought minutes", () => {
    expect(durationLabel(60)).toBe("1 hour");
    expect(durationLabel(120)).toBe("2 hours");
  });

  it("says both where there are both", () => {
    expect(durationLabel(90)).toBe("1 hour 30 minutes");
    expect(durationLabel(75)).toBe("1 hour 15 minutes");
  });

  it("says nothing at all for an untimed paper", () => {
    // The brief leaves the whole block out rather than printing a label for
    // the absence of a limit.
    expect(durationLabel(0)).toBe("");
    expect(durationLabel(null)).toBe("");
    expect(durationLabel(undefined)).toBe("");
  });
});

describe("shortDuration — the rail row, where there is no room for words", () => {
  it("abbreviates", () => {
    expect(shortDuration(90)).toBe("90 min");
    expect(shortDuration(45)).toBe("45 min");
  });

  it("is empty for an untimed paper, so the row shows no tag", () => {
    expect(shortDuration(0)).toBe("");
    expect(shortDuration(null)).toBe("");
  });
});

describe("clockFace — what the countdown reads", () => {
  it("counts minutes and seconds", () => {
    expect(clockFace(29 * 60000 + 4000)).toBe("29:04");
    expect(clockFace(9 * 60000 + 4000)).toBe("9:04");
  });

  it("does not pad the minutes until there are hours in front of them", () => {
    // 9:04 is how a clock is read everywhere else; 09:04 is a time of day.
    expect(clockFace(9 * 60000)).toBe("9:00");
    expect(clockFace(60 * 60000 + 9 * 60000)).toBe("1:09:00");
  });

  it("rounds up, so a paper never reads nought with time still on it", () => {
    expect(clockFace(500)).toBe("0:01");
    expect(clockFace(1)).toBe("0:01");
  });

  it("floors at nought rather than counting past it", () => {
    expect(clockFace(0)).toBe("0:00");
    expect(clockFace(-90000)).toBe("0:00");
  });
});

describe("spokenTimeLeft — what is said, which is not what is shown", () => {
  it("names the unit, because the digits read as a time of day", () => {
    expect(spokenTimeLeft(29 * 60000)).toBe("29 minutes left");
    expect(spokenTimeLeft(60000)).toBe("1 minute left");
  });

  it("counts seconds in the last minute", () => {
    expect(spokenTimeLeft(30000)).toBe("30 seconds left");
    expect(spokenTimeLeft(1000)).toBe("1 second left");
  });

  it("says time is up rather than nought", () => {
    expect(spokenTimeLeft(0)).toBe("Time is up");
    expect(spokenTimeLeft(-1000)).toBe("Time is up");
  });
});

describe("LOW_TIME_MS", () => {
  it("is the last five minutes", () => {
    expect(LOW_TIME_MS).toBe(5 * 60 * 1000);
  });
});
