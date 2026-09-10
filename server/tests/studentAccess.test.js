import { describe, it, expect } from "@jest/globals";
import { mayActOnStudent, teachesStudent } from "../src/middleware/student.guard.js";

/**
 * Who may act on a student's record.
 *
 * The rule these tests pin was missing entirely: the student routes checked the
 * caller's role and never which students were theirs, so any signed-in assessor
 * could read any student's progress, results, badges and certificates by
 * putting their id in the URL — and write to the record too, since the same
 * guard sits on marking a lesson complete and on handing a quiz in.
 *
 * It is the same hole `assessorAccess.test.js` pins shut on the other side of
 * the same data.
 */

const JAVA = "6b1f8fabafe387a98b8370a1";
const NETWORKING = "6b1f8fabafe387a98b8370a2";

const MIKE = { _id: "6a2f8fabafe387a98b837148", assigned_courses: [JAVA] };
const PATRICIA = { _id: "6a2f8fabafe387a98b837149", assigned_courses: [NETWORKING] };

const ANNA = { _id: "6c3f8fabafe387a98b837201", enrolledCourses: [JAVA] };

const session = (id, role = "assessor") => ({ id, role });

describe("teachesStudent", () => {
  it("is true when the student sits on a course the assessor teaches", () => {
    expect(teachesStudent(MIKE, ANNA)).toBe(true);
  });

  it("is false for an assessor who teaches none of the student's courses", () => {
    expect(teachesStudent(PATRICIA, ANNA)).toBe(false);
  });

  it("is true on any one shared course, not all of them", () => {
    const both = { ...ANNA, enrolledCourses: [NETWORKING, JAVA] };
    expect(teachesStudent(MIKE, both)).toBe(true);
    expect(teachesStudent(PATRICIA, both)).toBe(true);
  });

  it("refuses an assessor assigned nothing", () => {
    expect(teachesStudent({ _id: "x" }, ANNA)).toBe(false);
    expect(teachesStudent({ _id: "x", assigned_courses: [] }, ANNA)).toBe(false);
  });

  it("refuses a student enrolled in nothing", () => {
    expect(teachesStudent(MIKE, { _id: "y" })).toBe(false);
    expect(teachesStudent(MIKE, { _id: "y", enrolledCourses: [] })).toBe(false);
  });

  /**
   * Ids come off a document as ObjectIds and out of a session as text, so
   * comparing them raw would refuse every legitimate call — the same trap
   * `mayActAs` documents.
   */
  it("compares course ids as text, whatever type they arrived as", () => {
    const objectish = { _id: "z", enrolledCourses: [{ toString: () => JAVA }] };
    expect(teachesStudent(MIKE, objectish)).toBe(true);
  });

  /**
   * `loadEnrollment` in courses.controller.js accepts all three spellings, and
   * it decides which courses these routes will serve. Reading enrolment more
   * narrowly here would refuse an assessor a record the route behind the guard
   * would then have handed over.
   */
  it("reads enrolment under every spelling the routes themselves accept", () => {
    expect(teachesStudent(MIKE, { enrolled_courses: [JAVA] })).toBe(true);
    expect(teachesStudent(MIKE, { courses: [JAVA] })).toBe(true);
  });

  it("refuses a student or an assessor who resolved to nobody", () => {
    expect(teachesStudent(MIKE, null)).toBe(false);
    expect(teachesStudent(null, ANNA)).toBe(false);
  });
});

describe("mayActOnStudent", () => {
  it("lets a student reach their own record", () => {
    expect(mayActOnStudent(session(ANNA._id, "student"), ANNA._id)).toBe(true);
  });

  it("refuses a student reaching somebody else's", () => {
    expect(mayActOnStudent(session(ANNA._id, "student"), "6c3f8fabafe387a98b837202")).toBe(false);
  });

  it("lets the assessor who teaches them through", () => {
    expect(
      mayActOnStudent(session(MIKE._id), ANNA._id, { assessor: MIKE, student: ANNA })
    ).toBe(true);
  });

  /** The whole of the bug: this answered true on the role alone. */
  it("refuses an assessor who does not teach them", () => {
    expect(
      mayActOnStudent(session(PATRICIA._id), ANNA._id, { assessor: PATRICIA, student: ANNA })
    ).toBe(false);
  });

  it("refuses an assessor asking after a student who resolves to nobody", () => {
    // Answered the same way as somebody else's student, so the routes cannot be
    // walked to find out which student ids exist.
    expect(
      mayActOnStudent(session(MIKE._id), "no-such-student", { assessor: MIKE, student: null })
    ).toBe(false);
  });

  it("refuses an assessor whose own document did not resolve", () => {
    expect(mayActOnStudent(session(MIKE._id), ANNA._id, { assessor: null, student: ANNA })).toBe(
      false
    );
  });

  it("does not let an assessor through by naming themselves", () => {
    // The self clause is a student's, not a fallback for anyone whose id
    // happens to match the path.
    expect(mayActOnStudent(session(MIKE._id), MIKE._id, {})).toBe(false);
  });

  it("lets an admin reach anyone, which is what that console reports on", () => {
    expect(mayActOnStudent(session("some-admin", "admin"), ANNA._id)).toBe(true);
    expect(mayActOnStudent(session("some-admin", "admin"), "anybody-at-all")).toBe(true);
  });

  it("admits nobody without a session", () => {
    expect(mayActOnStudent(null, ANNA._id)).toBe(false);
    expect(mayActOnStudent(undefined, ANNA._id)).toBe(false);
  });

  it("admits nobody holding a role it does not know", () => {
    expect(mayActOnStudent({ id: ANNA._id, role: "registrar" }, ANNA._id)).toBe(false);
  });
});
