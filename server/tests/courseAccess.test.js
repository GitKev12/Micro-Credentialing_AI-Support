import { describe, it, expect } from "@jest/globals";
import {
  authoringRestrictionFrom,
  classSuspensionFrom,
  courseRestriction,
  formatCourseDay,
  hasCourseEnded,
  toCourseAccess
} from "../src/lib/courseAccess.js";

const iso = (day) => `${day}T00:00:00.000Z`;

/** A course with a run, as the Course collection stores one. */
const running = { startsOn: new Date(iso("2026-08-04")), endsOn: new Date(iso("2026-10-10")) };

describe("hasCourseEnded", () => {
  it("keeps the course open on its own end date", () => {
    // The end date is the last day of the run, not the first day after it —
    // the same reading that makes a one-day course one day long.
    expect(hasCourseEnded(running, new Date(iso("2026-10-10")))).toBe(false);
    expect(hasCourseEnded(running, new Date("2026-10-10T23:59:59.000Z"))).toBe(false);
  });

  it("closes it the next day, and stays closed", () => {
    expect(hasCourseEnded(running, new Date(iso("2026-10-11")))).toBe(true);
    expect(hasCourseEnded(running, new Date(iso("2027-01-01")))).toBe(true);
  });

  it("is open before and during the run", () => {
    expect(hasCourseEnded(running, new Date(iso("2026-07-01")))).toBe(false);
    expect(hasCourseEnded(running, new Date(iso("2026-09-15")))).toBe(false);
  });

  // Courses written before the dates existed carry neither, and are not
  // retrospectively closed by a field they never had.
  it("never ends a course that has no end date", () => {
    expect(hasCourseEnded({}, new Date(iso("2030-01-01")))).toBe(false);
    expect(hasCourseEnded({ startsOn: new Date(iso("2026-08-04")) })).toBe(false);
    expect(hasCourseEnded(null)).toBe(false);
    expect(hasCourseEnded({ endsOn: "whenever" })).toBe(false);
  });

  it("reads the stored value however it was stored", () => {
    expect(hasCourseEnded({ endsOn: iso("2026-10-10") }, new Date(iso("2026-10-11")))).toBe(true);
    expect(hasCourseEnded({ endsOn: iso("2026-10-10") }, new Date(iso("2026-10-10")))).toBe(false);
  });
});

describe("formatCourseDay", () => {
  it("writes the stored day as a person would", () => {
    expect(formatCourseDay(new Date(iso("2026-10-10")))).toBe("Oct 10, 2026");
    expect(formatCourseDay(iso("2026-01-05"))).toBe("Jan 5, 2026");
  });

  it("has nothing to say about a course with no date", () => {
    expect(formatCourseDay(null)).toBe("");
    expect(formatCourseDay("next term")).toBe("");
  });
});

describe("courseRestriction", () => {
  it("is nothing at all while the course is running", () => {
    expect(courseRestriction(running, new Date(iso("2026-09-15")))).toBeNull();
    expect(courseRestriction({}, new Date(iso("2026-09-15")))).toBeNull();
  });

  it("names the day the course closed, so the refusal explains itself", () => {
    const restriction = courseRestriction(running, new Date(iso("2026-10-11")));

    expect(restriction.ended).toBe(true);
    expect(restriction.endedOn).toBe(iso("2026-10-10"));
    expect(restriction.reason).toContain("Oct 10, 2026");
    // Read-only, not shut: the student is told what they can still do.
    expect(restriction.reason).toMatch(/still read/);
  });
});

describe("toCourseAccess", () => {
  it("sends the run and the verdict on it together", () => {
    expect(toCourseAccess(running, new Date(iso("2026-09-15")))).toEqual({
      startsOn: iso("2026-08-04"),
      endsOn: iso("2026-10-10"),
      ended: false,
      endedReason: null,
      suspended: false,
      suspendedReason: null
    });
  });

  it("carries the reason once the run is over", () => {
    const access = toCourseAccess(running, new Date(iso("2026-10-11")));
    expect(access.ended).toBe(true);
    expect(access.endedReason).toContain("Oct 10, 2026");
  });

  it("reports a dateless course as open, with nothing to show for it", () => {
    expect(toCourseAccess({})).toEqual({
      startsOn: null,
      endsOn: null,
      ended: false,
      endedReason: null,
      suspended: false,
      suspendedReason: null
    });
  });

  it("carries the class's own closing, which the course dates know nothing of", () => {
    const suspension = classSuspensionFrom([{ active: false }]);
    const access = toCourseAccess(running, new Date(iso("2026-09-15")), suspension);

    expect(access.suspended).toBe(true);
    expect(access.suspendedReason).toBe(suspension.reason);
    // The run is untouched — it is this student's class that closed.
    expect(access.ended).toBe(false);
  });
});

describe("classSuspensionFrom", () => {
  it("closes the course when every class holding the student is off", () => {
    const suspension = classSuspensionFrom([{ active: false }, { active: false }]);

    expect(suspension.suspended).toBe(true);
    expect(suspension.reason).toMatch(/switched off/);
    // Reversible, and said so: the student did nothing to cause this.
    expect(suspension.reason).toMatch(/back to active/);
  });

  it("keeps it open while one class is still running", () => {
    expect(classSuspensionFrom([{ active: false }, { active: true }])).toBeNull();
    expect(classSuspensionFrom([{ active: true }])).toBeNull();
  });

  // Classes written before the switch existed carry no field, and every one of
  // those was running — so only an explicit false turns a class off.
  it("treats a class with no switch as running", () => {
    expect(classSuspensionFrom([{}])).toBeNull();
    expect(classSuspensionFrom([{ active: undefined }, { active: false }])).toBeNull();
  });

  // A student enrolled straight from the Students screen belongs to no class,
  // and there is no switch to read — that enrolment is not closed by proxy.
  it("closes nothing for a student who is in no class at all", () => {
    expect(classSuspensionFrom([])).toBeNull();
    expect(classSuspensionFrom(null)).toBeNull();
    expect(classSuspensionFrom(undefined)).toBeNull();
  });

  /**
   * The other way a place closes: the assessor stands one student down from
   * the course, on a class that is otherwise running for everybody else.
   *
   * This is course access, not the admin console's account suspension — that
   * one stops a person signing in at all and is nowhere near this file.
   */
  describe("a student their assessor has closed the course to", () => {
    const running = [{ active: true, studentIds: ["s1", "s2"], suspendedStudentIds: ["s1"] }];

    it("is closed out while the class carries on", () => {
      const suspension = classSuspensionFrom(running, "s1");

      expect(suspension.suspended).toBe(true);
      expect(suspension.by).toBe("assessor");
      // It says what is *not* affected, because the two suspensions in this
      // system are easy to confuse from the receiving end.
      expect(suspension.reason).toMatch(/other courses are not affected/);
    });

    it("leaves everybody else in the class alone", () => {
      expect(classSuspensionFrom(running, "s2")).toBeNull();
    });

    it("is not read at all when nobody is named", () => {
      // The staff side asks this of a course with no student in mind.
      expect(classSuspensionFrom(running)).toBeNull();
      expect(classSuspensionFrom(running, null)).toBeNull();
    });

    it("compares ids as text, whatever type they arrived as", () => {
      const objectish = [{ active: true, suspendedStudentIds: [{ toString: () => "s1" }] }];
      expect(classSuspensionFrom(objectish, "s1").by).toBe("assessor");
    });

    it("survives a class that has never had one", () => {
      expect(classSuspensionFrom([{ active: true, studentIds: ["s1"] }], "s1")).toBeNull();
    });

    /**
     * Both can be true at once. The student's own standing is the one still
     * true after the class is switched back on, so answering with the class
     * would send them to the admin and then close on them again.
     */
    it("is reported ahead of a class that is also switched off", () => {
      const both = [{ active: false, suspendedStudentIds: ["s1"] }];

      expect(classSuspensionFrom(both, "s1").by).toBe("assessor");
      expect(classSuspensionFrom(both, "s2").by).toBe("class");
    });
  });
});

describe("authoringRestrictionFrom", () => {
  const during = new Date(iso("2026-09-15"));
  const after = new Date(iso("2026-10-11"));

  it("lets papers be written while the course is running", () => {
    expect(authoringRestrictionFrom(running, [{ active: true }], during)).toBeNull();
    expect(authoringRestrictionFrom(running, [], during)).toBeNull();
  });

  it("closes writing once the run is over, and says which day it ended", () => {
    const restriction = authoringRestrictionFrom(running, [{ active: true }], after);

    expect(restriction.ended).toBe(true);
    expect(restriction.suspended).toBe(false);
    expect(restriction.endedOn).toBe(iso("2026-10-10"));
    expect(restriction.reason).toContain("Oct 10, 2026");
  });

  it("closes writing when every class on the course is switched off", () => {
    const restriction = authoringRestrictionFrom(running, [{ active: false }, { active: false }], during);

    expect(restriction.suspended).toBe(true);
    // The run is untouched. It is the classes that closed, and an administrator
    // can reopen them this afternoon — so the reason has to say which it is.
    expect(restriction.ended).toBe(false);
    expect(restriction.reason).toMatch(/switched off/);
    expect(restriction.reason).toMatch(/back to active/);
  });

  it("keeps writing open while one class is still running", () => {
    expect(authoringRestrictionFrom(running, [{ active: false }, { active: true }], during)).toBeNull();
    // A class written before the switch existed carries no field, and every one
    // of those was running.
    expect(authoringRestrictionFrom(running, [{}, { active: false }], during)).toBeNull();
  });

  // A course nobody has built a class for is reached straight from the Students
  // screen. There is no switch to read, so nothing closes it by proxy.
  it("closes nothing for a course with no classes at all", () => {
    expect(authoringRestrictionFrom(running, [], during)).toBeNull();
    expect(authoringRestrictionFrom(running, null, during)).toBeNull();
  });

  it("names the switch rather than the calendar when both have closed", () => {
    // The stricter of the two, and the one that can be undone — the same order
    // the student's own gate answers in.
    const restriction = authoringRestrictionFrom(running, [{ active: false }], after);

    expect(restriction.suspended).toBe(true);
    expect(restriction.ended).toBe(false);
  });

  // Courses written before the run dates existed carry neither, and are not
  // retrospectively closed to their assessor by a field they never had.
  it("never closes a course that has no end date", () => {
    expect(authoringRestrictionFrom({}, [{ active: true }], new Date(iso("2030-01-01")))).toBeNull();
    expect(authoringRestrictionFrom(null, [], new Date(iso("2030-01-01")))).toBeNull();
  });
});
