import { describe, it, expect } from "@jest/globals";
import { papersByCourse, tallyWorkload } from "../src/admin/admin.controller.js";

/**
 * The admin console's view of an assessor, without a database.
 *
 * These two functions are what the Assessors Management screen reports, and
 * both are pure for this reason: StudentResult and Assessment stay empty until
 * a course is set up and somebody takes a paper, so every number on that screen
 * would otherwise go unchecked until the day it first mattered.
 */

const CC2 = "course-cc2";
const CC3 = "course-cc3";

/** Eight lessons in CC2, three in CC3. */
const lessons = new Map([
  [CC2, 8],
  [CC3, 3]
]);

const lessonPaper = (courseId, moduleId, extra = {}) => ({
  courseId,
  moduleId,
  scope: "lesson",
  status: "posted",
  ...extra
});

const finalPaper = (courseId, extra = {}) => ({
  courseId,
  moduleId: null,
  scope: "final",
  status: "posted",
  ...extra
});

describe("papersByCourse", () => {
  it("owes one paper per lesson plus the course final", () => {
    const papers = papersByCourse([], lessons);

    expect(papers.get(CC2).expected).toBe(9);
    expect(papers.get(CC3).expected).toBe(4);
    // A course with nothing written for it still has to appear: that is the
    // course worth reporting, not the one that can be skipped.
    expect(papers.get(CC2).posted).toBe(0);
    expect(papers.get(CC2).toPost).toBe(9);
  });

  it("counts a lesson once however many papers exist for it", () => {
    // Regenerating replaces a lesson's paper. Two documents for one lesson must
    // not read as two papers delivered — that would let a course report more
    // posted than it has lessons, and reach zero owed with lessons uncovered.
    const papers = papersByCourse(
      [lessonPaper(CC2, "m1"), lessonPaper(CC2, "m1"), lessonPaper(CC2, "m2")],
      lessons
    );

    expect(papers.get(CC2).posted).toBe(2);
    expect(papers.get(CC2).toPost).toBe(7);
  });

  it("counts a draft as written but still owed", () => {
    const papers = papersByCourse(
      [lessonPaper(CC2, "m1"), lessonPaper(CC2, "m2", { status: "draft" })],
      lessons
    );

    expect(papers.get(CC2).posted).toBe(1);
    expect(papers.get(CC2).draft).toBe(1);
    expect(papers.get(CC2).toPost).toBe(8);
  });

  it("reads a paper written before releasing existed as posted", () => {
    // Those were live from the moment they were generated, and the student side
    // still serves them. Treating a missing status as a draft would shut every
    // existing course's quizzes the day this shipped.
    const papers = papersByCourse([{ courseId: CC2, moduleId: "m1", scope: "lesson" }], lessons);

    expect(papers.get(CC2).posted).toBe(1);
    expect(papers.get(CC2).draft).toBe(0);
  });

  it("counts the final separately from the lessons", () => {
    const papers = papersByCourse([finalPaper(CC3), lessonPaper(CC3, "m1")], lessons);

    expect(papers.get(CC3).posted).toBe(2);
    expect(papers.get(CC3).toPost).toBe(2);
  });

  it("takes the newest posting date as the course's last", () => {
    const papers = papersByCourse(
      [
        lessonPaper(CC2, "m1", { postedAt: "2026-08-01T00:00:00.000Z" }),
        lessonPaper(CC2, "m2", { postedAt: "2026-08-20T00:00:00.000Z" }),
        lessonPaper(CC2, "m3", { status: "draft", postedAt: "2026-08-30T00:00:00.000Z" })
      ],
      lessons
    );

    expect(papers.get(CC2).lastPosted.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });
});

const assessor = (id, courses) => ({ _id: id, assigned_courses: courses });

/** A submission whose grade the assessor has not put out. */
const unreleased = (courseId, overrides = {}) => ({
  courseId,
  review: { status: "pending" },
  credential: { status: "none" },
  ...overrides
});

const released = (courseId, overrides = {}) =>
  unreleased(courseId, {
    review: { status: "released", gradedBy: "a1", gradedAt: "2026-08-11T00:00:00.000Z" },
    ...overrides
  });

describe("tallyWorkload", () => {
  const papers = papersByCourse([lessonPaper(CC2, "m1"), finalPaper(CC2)], lessons);

  it("gives each assessor the papers their courses owe", () => {
    const tallies = tallyWorkload([assessor("a1", [CC2])], { papers });
    const tally = tallies.get("a1");

    expect(tally.papersExpected).toBe(9);
    expect(tally.papersPosted).toBe(2);
    expect(tally.perCourse.get(CC2).papersPosted).toBe(2);
  });

  it("gives a shared course to both of its assessors in full", () => {
    // Each of them sees the same class and owes the same papers — halving the
    // work between them would say neither has anything much to do.
    const tallies = tallyWorkload([assessor("a1", [CC2]), assessor("a2", [CC2])], { papers });

    expect(tallies.get("a1").papersExpected).toBe(9);
    expect(tallies.get("a2").papersExpected).toBe(9);
  });

  it("does not double a course listed twice on one assessor", () => {
    const tallies = tallyWorkload([assessor("a1", [CC2, CC2])], { papers });

    expect(tallies.get("a1").papersExpected).toBe(9);
  });

  it("counts an assessor with no courses as owing nothing", () => {
    const tallies = tallyWorkload([assessor("a3", [])], { papers });

    expect(tallies.get("a3").papersExpected).toBe(0);
    expect(tallies.get("a3").credentialsPending).toBe(0);
  });

  it("counts nothing off a submission whose grade is not out yet", () => {
    // The unreleased backlog is the class roster's business, and a credential
    // is not the assessor's to issue until the grade behind it is out.
    const tallies = tallyWorkload([assessor("a1", [CC2])], {
      papers,
      results: [unreleased(CC2), unreleased(CC2, { credential: { status: "pending" } })]
    });

    const tally = tallies.get("a1");
    expect(tally.credentialsPending).toBe(0);
    expect(tally.credentialsIssued).toBe(0);
  });

  it("leaves retired attempts out of the counts", () => {
    // A lesson quiz may be retaken without limit. Counting every attempt would
    // let one student inflate an assessor's figures indefinitely, and the
    // assessor's own screens drop them already.
    const tallies = tallyWorkload([assessor("a1", [CC2])], {
      papers,
      results: [
        released(CC2, { superseded: true, credential: { status: "issued" } }),
        released(CC2, { credential: { status: "issued" } })
      ]
    });

    expect(tallies.get("a1").credentialsIssued).toBe(1);
  });

  it("counts a credential as waiting only once its grade is out", () => {
    // Pending on an unreleased paper is not the assessor's to act on yet — it
    // matches the condition behind their own Credentials screen exactly.
    const tallies = tallyWorkload([assessor("a1", [CC2])], {
      papers,
      results: [
        released(CC2, { credential: { status: "pending" } }),
        unreleased(CC2, { credential: { status: "pending" } }),
        released(CC2, { credential: { status: "issued" } })
      ]
    });

    const tally = tallies.get("a1");
    expect(tally.credentialsPending).toBe(1);
    expect(tally.credentialsIssued).toBe(1);
    expect(tally.perCourse.get(CC2).credentialsPending).toBe(1);
  });

  it("keeps an assessor's grading credit on a course they no longer hold", () => {
    // Everything else counts toward whoever holds the course today. lastGraded
    // follows gradedBy, because what it answers is whether this person is
    // working at all — not what their current classes look like.
    const tallies = tallyWorkload([assessor("a1", []), assessor("a2", [CC2])], {
      papers,
      results: [released(CC2, { credential: { status: "issued" } })]
    });

    expect(tallies.get("a1").lastGraded.toISOString()).toBe("2026-08-11T00:00:00.000Z");
    expect(tallies.get("a1").credentialsIssued).toBe(0);
    expect(tallies.get("a2").credentialsIssued).toBe(1);
    expect(tallies.get("a2").lastGraded).toBeNull();
  });

  it("ignores submissions in a course nobody is assigned to", () => {
    const tallies = tallyWorkload([assessor("a1", [CC2])], {
      papers,
      results: [released(CC3, { credential: { status: "issued" } })]
    });

    expect(tallies.get("a1").credentialsIssued).toBe(0);
  });
});
