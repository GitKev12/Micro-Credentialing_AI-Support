import { describe, it, expect } from "@jest/globals";
import {
  assessorCountError,
  studentClashError,
  studentsHeldElsewhere
} from "../src/admin/class.rules.js";

/**
 * The two rules that make a Class a section.
 *
 * Neither existed before: the collection has no schema behind it, so it took
 * five assessors on one class and the same student in two sections of one
 * course, and the write path was built to tolerate both. These pin the rules
 * where they can be exercised without a database.
 */

const CC2 = "course-cc2";

const section = (id, name, studentIds) => ({ _id: id, name, courseId: CC2, studentIds });

describe("assessorCountError", () => {
  it("passes one assessor, which is what a section has", () => {
    expect(assessorCountError(["a1"])).toBeNull();
  });

  it("refuses none — a section with nobody in front of it is a timetable entry", () => {
    expect(assessorCountError([])).toMatch(/needs an assessor/i);
    expect(assessorCountError(undefined)).toMatch(/needs an assessor/i);
  });

  it("refuses two, and says what to do instead", () => {
    expect(assessorCountError(["a1", "a2"])).toMatch(/one assessor/i);
  });

  it("tells none and too many apart — they are different mistakes", () => {
    expect(assessorCountError([])).not.toEqual(assessorCountError(["a1", "a2"]));
  });
});

describe("studentsHeldElsewhere", () => {
  const classes = [
    section("k1", "IT01", ["s1", "s2"]),
    section("k2", "IT02", ["s3"])
  ];

  it("finds a student another section on the course already has", () => {
    expect(studentsHeldElsewhere(classes, ["s3"])).toEqual([
      { studentId: "s3", className: "IT02" }
    ]);
  });

  it("lets a class keep the students it already has", () => {
    // The whole reason `exceptClassId` exists: saving IT01 unchanged must not
    // read its own roster as putting those students somewhere twice.
    expect(studentsHeldElsewhere(classes, ["s1", "s2"], "k1")).toEqual([]);
  });

  it("still refuses somebody else's student on an edit", () => {
    expect(studentsHeldElsewhere(classes, ["s1", "s3"], "k1")).toEqual([
      { studentId: "s3", className: "IT02" }
    ]);
  });

  it("passes a student who is in no section of this course", () => {
    expect(studentsHeldElsewhere(classes, ["s9"])).toEqual([]);
  });

  it("reports a student once however many sections hold them", () => {
    // Data written before the rule existed can be in two at once. That is one
    // thing to fix, so it is one line, not two.
    const doubled = [...classes, section("k3", "IT03", ["s3"])];
    expect(studentsHeldElsewhere(doubled, ["s3"])).toHaveLength(1);
  });

  it("compares ids as text, whatever type they arrived as", () => {
    // Ids come off documents as ObjectIds and off the request as strings.
    const objectish = { toString: () => "s3" };
    expect(studentsHeldElsewhere(classes, [objectish])).toEqual([
      { studentId: "s3", className: "IT02" }
    ]);
  });

  it("asks nothing when no students are being saved", () => {
    expect(studentsHeldElsewhere(classes, [])).toEqual([]);
    expect(studentsHeldElsewhere(classes, undefined)).toEqual([]);
  });

  it("survives a class with no roster at all", () => {
    expect(studentsHeldElsewhere([{ _id: "k9", name: "Empty" }], ["s1"])).toEqual([]);
  });
});

describe("studentClashError", () => {
  const nameOf = (id) => ({ s1: "Angela Reyes", s3: "Nicole Fernandez" })[id] ?? id;

  it("says nothing when there is nothing wrong", () => {
    expect(studentClashError([], nameOf)).toBeNull();
  });

  it("names the student and the class that has them", () => {
    const message = studentClashError([{ studentId: "s3", className: "IT02" }], nameOf);
    expect(message).toContain("Nicole Fernandez");
    expect(message).toContain("IT02");
    expect(message).toMatch(/\bis already\b/);
  });

  it("says are, not is, for more than one", () => {
    const message = studentClashError(
      [
        { studentId: "s1", className: "IT01" },
        { studentId: "s3", className: "IT02" }
      ],
      nameOf
    );
    expect(message).toMatch(/\bare already\b/);
  });

  it("counts the rest rather than listing a paragraph of names", () => {
    const many = ["a", "b", "c", "d", "e"].map((id) => ({ studentId: id, className: "IT01" }));
    expect(studentClashError(many, nameOf)).toContain("and 2 more");
  });
});
