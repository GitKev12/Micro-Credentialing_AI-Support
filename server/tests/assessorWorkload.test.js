import { describe, it, expect } from "@jest/globals";
import { papersByCourse } from "../src/assessments/papers.js";
import { isPosted } from "../src/assessments/assessments.format.js";
import { tallyWorkload } from "../src/admin/admin.controller.js";

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

  it("counts a paper written before releasing existed as still owed", () => {
    // No assessor posted it, so no student may see it — the workload screen
    // has to report it as a paper the course is still waiting on rather than
    // as one already out.
    const papers = papersByCourse([{ courseId: CC2, moduleId: "m1", scope: "lesson" }], lessons);

    expect(papers.get(CC2).posted).toBe(0);
    expect(papers.get(CC2).draft).toBe(1);
  });

  it("reads a statusless paper the same way the student side does", () => {
    // The bug this function exists to prevent. Both consoles once counted
    // posted papers themselves: the admin asked `isPosted`, the assessor asked
    // `status !== "draft"`, and a document carrying no status at all was a
    // draft to one and a live paper to the other. The assessor's register said
    // a class had its quiz; the student opening it was refused.
    const statusless = [
      { courseId: CC2, moduleId: "m1", scope: "lesson" },
      { courseId: CC2, moduleId: null, scope: "final" }
    ];

    const papers = papersByCourse(statusless, lessons);

    expect(isPosted(statusless[0])).toBe(false);
    expect(papers.get(CC2).posted).toBe(0);
    expect(papers.get(CC2).finalPosted).toBe(false);
    expect(papers.get(CC2).toPost).toBe(papers.get(CC2).expected);
  });

  it("splits what is written between posted and still owed", () => {
    // `written` is what the assessor's register shows beside `posted`, and the
    // two have to come from one pass or a draft can be counted as delivered.
    const papers = papersByCourse(
      [lessonPaper(CC2, "m1"), lessonPaper(CC2, "m2", { status: "draft" }), finalPaper(CC2)],
      lessons
    );

    expect(papers.get(CC2).written).toBe(3);
    expect(papers.get(CC2).posted).toBe(2);
    expect(papers.get(CC2).draft).toBe(1);
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

/** A submission that did not clear the pass mark, so it earned nothing. */
const failed = (courseId, overrides = {}) => ({
  courseId,
  credential: { status: "none" },
  ...overrides
});

/** A pass, which writes its own pending credential when it is handed in. */
const passed = (courseId, overrides = {}) =>
  failed(courseId, { credential: { status: "pending" }, ...overrides });

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

  it("counts nothing off a submission that did not pass", () => {
    // A failed paper earns no credential, so there is nothing on it for an
    // assessor to be behind on.
    const tallies = tallyWorkload([assessor("a1", [CC2])], {
      papers,
      results: [failed(CC2), failed(CC2)]
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
        passed(CC2, { superseded: true, credential: { status: "issued" } }),
        passed(CC2, { credential: { status: "issued" } })
      ]
    });

    expect(tallies.get("a1").credentialsIssued).toBe(1);
  });

  it("separates a credential still waiting from one already issued", () => {
    // The same pair the assessor's own Credentials screen splits on, so the
    // two cannot disagree about what is waiting on them.
    const tallies = tallyWorkload([assessor("a1", [CC2])], {
      papers,
      results: [
        passed(CC2),
        failed(CC2),
        passed(CC2, { credential: { status: "issued" } })
      ]
    });

    const tally = tallies.get("a1");
    expect(tally.credentialsPending).toBe(1);
    expect(tally.credentialsIssued).toBe(1);
    expect(tally.perCourse.get(CC2).credentialsPending).toBe(1);
  });

  it("counts a submission toward whoever holds its course today", () => {
    // Nothing on a submission names the assessor any more — marking is the
    // system's and issuing is stamped on the result — so the course is the
    // only link back to a person.
    const tallies = tallyWorkload([assessor("a1", []), assessor("a2", [CC2])], {
      papers,
      results: [passed(CC2, { credential: { status: "issued" } })]
    });

    expect(tallies.get("a1").credentialsIssued).toBe(0);
    expect(tallies.get("a2").credentialsIssued).toBe(1);
  });

  it("ignores submissions in a course nobody is assigned to", () => {
    const tallies = tallyWorkload([assessor("a1", [CC2])], {
      papers,
      results: [passed(CC3, { credential: { status: "issued" } })]
    });

    expect(tallies.get("a1").credentialsIssued).toBe(0);
  });
});
