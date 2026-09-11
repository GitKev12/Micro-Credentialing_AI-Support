import { describe, it, expect } from "@jest/globals";
import {
  daysLeftInRun,
  formatCourseEnded,
  formatCourseLength,
  formatCourseRange,
  formatCourseRun,
  hasCourseEnded,
  isRunInOrder,
  toDateInput
} from "../src/lib/courseDuration";

const iso = (day) => `${day}T00:00:00.000Z`;

describe("formatCourseRange", () => {
  it("prints the year once when both ends share it", () => {
    expect(formatCourseRange({ startsOn: iso("2026-08-04"), endsOn: iso("2026-10-10") })).toBe(
      "Aug 4 – Oct 10, 2026"
    );
  });

  it("prints both years when the run crosses one", () => {
    expect(formatCourseRange({ startsOn: iso("2026-12-01"), endsOn: iso("2027-02-02") })).toBe(
      "Dec 1, 2026 – Feb 2, 2027"
    );
  });

  it("says which end it knows when only one is set", () => {
    expect(formatCourseRange({ startsOn: iso("2026-08-04") })).toBe("From Aug 4, 2026");
    expect(formatCourseRange({ endsOn: iso("2026-10-10") })).toBe("Until Oct 10, 2026");
  });

  it("has nothing to say about a course with no dates", () => {
    expect(formatCourseRange({})).toBeNull();
    expect(formatCourseRange(null)).toBeNull();
    expect(formatCourseRange({ startsOn: "sometime" })).toBeNull();
  });

  // The dates are stored at UTC midnight, so a reader west of Greenwich would
  // otherwise see every course start a day early.
  it("reads the day in UTC, not in the reader's zone", () => {
    expect(formatCourseRange({ startsOn: "2026-08-04T00:00:00.000Z" })).toBe("From Aug 4, 2026");
  });
});

describe("formatCourseLength", () => {
  it("counts both end days", () => {
    expect(formatCourseLength({ startsOn: iso("2026-08-04"), endsOn: iso("2026-10-10") })).toBe(
      "10 weeks"
    );
    expect(formatCourseLength({ startsOn: iso("2026-08-04"), endsOn: iso("2026-08-10") })).toBe(
      "1 week"
    );
  });

  it("counts a short run in days rather than rounding it to a week", () => {
    expect(formatCourseLength({ startsOn: iso("2026-08-04"), endsOn: iso("2026-08-04") })).toBe(
      "1 day"
    );
    expect(formatCourseLength({ startsOn: iso("2026-08-04"), endsOn: iso("2026-08-06") })).toBe(
      "3 days"
    );
  });

  it("is nothing at all when one end is open", () => {
    expect(formatCourseLength({ startsOn: iso("2026-08-04") })).toBeNull();
    expect(formatCourseLength({ endsOn: iso("2026-10-10") })).toBeNull();
  });
});

describe("formatCourseRun", () => {
  it("joins the range and the length", () => {
    expect(formatCourseRun({ startsOn: iso("2026-08-04"), endsOn: iso("2026-10-10") })).toBe(
      "Aug 4 – Oct 10, 2026 · 10 weeks"
    );
  });

  it("drops the length when there is only one date", () => {
    expect(formatCourseRun({ startsOn: iso("2026-08-04") })).toBe("From Aug 4, 2026");
  });
});

describe("toDateInput", () => {
  it("hands the date input the day it wants", () => {
    expect(toDateInput(iso("2026-08-04"))).toBe("2026-08-04");
    expect(toDateInput(new Date(iso("2026-08-04")))).toBe("2026-08-04");
  });

  it("empties the field when there is nothing stored", () => {
    expect(toDateInput(null)).toBe("");
    expect(toDateInput("not a date")).toBe("");
  });
});

describe("isRunInOrder", () => {
  it("only objects once both ends are known and out of order", () => {
    expect(isRunInOrder("2026-08-04", "2026-10-10")).toBe(true);
    expect(isRunInOrder("2026-08-04", "2026-08-04")).toBe(true);
    expect(isRunInOrder("", "2026-08-04")).toBe(true);
    expect(isRunInOrder("2026-10-10", "2026-08-04")).toBe(false);
  });
});

describe("hasCourseEnded", () => {
  const run = { startsOn: iso("2026-08-04"), endsOn: iso("2026-10-10") };

  // The card only draws what the server has already decided; this is the rule
  // it falls back to, and it has to agree with the server's (courseAccess.js).
  it("keeps the course open on its last day and closes it the next", () => {
    expect(hasCourseEnded(run, new Date(iso("2026-10-10")))).toBe(false);
    expect(hasCourseEnded(run, new Date("2026-10-10T22:00:00.000Z"))).toBe(false);
    expect(hasCourseEnded(run, new Date(iso("2026-10-11")))).toBe(true);
  });

  it("never closes a course that has no end date", () => {
    expect(hasCourseEnded({ startsOn: iso("2026-08-04") }, new Date(iso("2030-01-01")))).toBe(
      false
    );
    expect(hasCourseEnded({}, new Date(iso("2030-01-01")))).toBe(false);
    expect(hasCourseEnded(null)).toBe(false);
  });
});

describe("daysLeftInRun", () => {
  const run = { startsOn: iso("2026-08-04"), endsOn: iso("2026-10-10") };

  it("counts whole days to the last day of the run", () => {
    expect(daysLeftInRun(run, new Date(iso("2026-09-11")))).toBe(29);
    expect(daysLeftInRun(run, new Date(iso("2026-10-09")))).toBe(1);
  });

  // Zero on the last day and negative after it, so it reads the same calendar
  // as hasCourseEnded — never "0 days left" on a course already closed.
  it("is zero on the last day and negative once the run is over", () => {
    expect(daysLeftInRun(run, new Date("2026-10-10T22:00:00.000Z"))).toBe(0);
    expect(hasCourseEnded(run, new Date("2026-10-10T22:00:00.000Z"))).toBe(false);
    expect(daysLeftInRun(run, new Date(iso("2026-10-11")))).toBe(-1);
    expect(hasCourseEnded(run, new Date(iso("2026-10-11")))).toBe(true);
  });

  it("has no count for a course with no end date", () => {
    expect(daysLeftInRun({ startsOn: iso("2026-08-04") })).toBeNull();
    expect(daysLeftInRun(null)).toBeNull();
  });
});

describe("formatCourseEnded", () => {
  it("names the day the course closed", () => {
    expect(formatCourseEnded({ endsOn: iso("2026-10-10") })).toBe("Ended Oct 10, 2026");
  });

  it("still says so when the date is missing", () => {
    expect(formatCourseEnded({})).toBe("Ended");
  });
});
