import { describe, it, expect } from "@jest/globals";
import { lockStateFor } from "../src/assessments/assessments.controller.js";
import { papersForClass, paperBelongsToClass } from "../src/assessments/classPapers.js";
import { classMode, isAssessOnly, toClassMode } from "../src/lib/classMode.js";
import { papersByCourse } from "../src/assessments/papers.js";

/**
 * The assess-only pathway.
 *
 * A candidate who already has the competence goes straight to the examination:
 * no lessons to finish, no quizzes to pass, no badges on the way. It is a
 * property of the class, so one course can be credentialed both ways at once —
 * one section taught through its lessons, another examined on a single paper.
 *
 * Three rules make it, and all three are here: what a class inherits, what
 * stands between a candidate and the final, and what a missing field means.
 */

const paper = (extra = {}) => ({
  _id: "a1",
  courseId: "c1",
  moduleId: "m1",
  scope: "lesson",
  status: "posted",
  title: "Lesson 1 Quiz",
  items: [
    { id: "g1", q: "One", choices: [{ id: "a", text: "Right" }], key: "a" },
    { id: "g2", q: "Two", choices: [{ id: "a", text: "Right" }], key: "a" }
  ],
  ...extra
});

const state = ({ done = [], modules = [], assessments = [], assessOnly = false } = {}) => ({
  completedModuleIds: new Set(done.map(String)),
  modules,
  assessments,
  assessOnly,
  resultByAssessment: new Map()
});

describe("classMode — what a class without the field means", () => {
  it("reads a class written before the pathway existed as taught", () => {
    // Every class in the database predates this field, and every one of them
    // was being taught. Missing is not unknown here — it is the answer.
    expect(classMode({})).toBe("taught");
    expect(classMode({ name: "CC2 — Section A" })).toBe("taught");
    expect(isAssessOnly({})).toBe(false);
  });

  it("takes only a pathway it recognises from a form", () => {
    expect(toClassMode("assessOnly")).toBe("assessOnly");
    expect(toClassMode("taught")).toBe("taught");
    // Anything else is a typo or a stale client, and guessing at it would put
    // a class on a pathway nobody chose.
    expect(toClassMode("assess-only")).toBe("taught");
    expect(toClassMode(undefined)).toBe("taught");
  });
});

describe("papersForClass — what an assess-only class inherits", () => {
  it("hands a taught class the course's papers as it always did", () => {
    const papers = [paper({ _id: "shared", classId: null })];

    expect(papersForClass(papers, "class-1").map((doc) => doc._id)).toEqual(["shared"]);
  });

  it("gives an assess-only class nothing course-wide", () => {
    // The course's lesson quizzes are not papers these candidates take, and the
    // course's final is the taught section's paper at the taught length — sixty
    // questions where this class was written a hundred. Inheriting it would
    // score them out of the wrong total without saying so.
    const papers = [
      paper({ _id: "shared-quiz", classId: null }),
      paper({ _id: "shared-final", classId: null, scope: "final", moduleId: null })
    ];

    expect(papersForClass(papers, "class-1", { assessOnly: true })).toEqual([]);
  });

  it("gives an assess-only class its own examination", () => {
    const papers = [
      paper({ _id: "shared-final", classId: null, scope: "final", moduleId: null }),
      paper({ _id: "mine", classId: "class-1", scope: "final", moduleId: null })
    ];

    expect(papersForClass(papers, "class-1", { assessOnly: true }).map((d) => d._id)).toEqual([
      "mine"
    ]);
  });

  it("still never hands over another class's paper", () => {
    const papers = [paper({ _id: "theirs", classId: "class-2", scope: "final", moduleId: null })];

    expect(papersForClass(papers, "class-1", { assessOnly: true })).toEqual([]);
  });

  it("says the same thing one paper at a time", () => {
    const shared = paper({ classId: null });

    expect(paperBelongsToClass(shared, "class-1")).toBe(true);
    expect(paperBelongsToClass(shared, "class-1", { assessOnly: true })).toBe(false);
    expect(paperBelongsToClass(paper({ classId: "class-1" }), "class-1", { assessOnly: true })).toBe(
      true
    );
  });
});

describe("lockStateFor — what stands in front of the examination", () => {
  const final = paper({ _id: "f1", scope: "final", moduleId: null, title: "Final Exam" });

  it("opens the final for an assess-only candidate with nothing finished", () => {
    // The whole point of the pathway: no lessons read, no quizzes passed, and
    // the examination is still open.
    const lock = lockStateFor(
      final,
      state({
        assessOnly: true,
        modules: [{ _id: "m1" }, { _id: "m2" }, { _id: "m3" }],
        assessments: [final]
      })
    );

    expect(lock).toEqual({ locked: false, reason: null });
  });

  it("keeps the assessor's gate in front of it", () => {
    // The one gate that survives. An unposted paper is the assessor's draft on
    // either pathway, and a candidate cannot take a paper nobody released.
    const lock = lockStateFor(
      paper({ _id: "f1", scope: "final", moduleId: null, status: "draft" }),
      state({ assessOnly: true, modules: [{ _id: "m1" }] })
    );

    expect(lock.locked).toBe(true);
    expect(lock.reason).toBe("Your assessor will unlock this final exam.");
  });

  it("leaves the taught pathway exactly as it was", () => {
    const lock = lockStateFor(
      final,
      state({ modules: [{ _id: "m1" }, { _id: "m2" }], assessments: [final] })
    );

    expect(lock.locked).toBe(true);
    expect(lock.reason).toBe("Complete 2 lessons to unlock the final exam.");
  });
});

describe("papersByCourse — what an assess-only class owes", () => {
  const CC3 = "course-3";
  const lessons = new Map([[CC3, 8]]);

  it("owes one examination, not a paper per lesson", () => {
    // Eight lessons, and the whole job is one paper. Counted the taught way
    // this class read as one paper out of nine with its work finished.
    const classes = new Map([[CC3, [{ id: "c1", mode: "assessOnly" }]]]);

    expect(papersByCourse([], lessons, classes).get(CC3).expected).toBe(1);
  });

  it("counts a taught class beside it at its own length", () => {
    const classes = new Map([
      [
        CC3,
        [
          { id: "taught", mode: "taught" },
          { id: "assess", mode: "assessOnly" }
        ]
      ]
    ]);

    // Nine for the taught section, one for the assess-only one.
    expect(papersByCourse([], lessons, classes).get(CC3).expected).toBe(10);
  });

  it("reports the assess-only class finished once its examination is out", () => {
    const classes = new Map([[CC3, [{ id: "c1", mode: "assessOnly" }]]]);
    const papers = [
      {
        courseId: CC3,
        classId: "c1",
        scope: "final",
        moduleId: null,
        status: "posted",
        postedAt: new Date()
      }
    ];

    const row = papersByCourse(papers, lessons, classes).get(CC3);
    expect(row.posted).toBe(1);
    expect(row.toPost).toBe(0);
    expect(row.finalPosted).toBe(true);
  });

  it("reads a bare id as a taught class, the way every caller passed it before", () => {
    const byId = papersByCourse([], lessons, new Map([[CC3, ["c1"]]]));
    const byObject = papersByCourse([], lessons, new Map([[CC3, [{ id: "c1", mode: "taught" }]]]));

    expect(byId.get(CC3)).toEqual(byObject.get(CC3));
    expect(byId.get(CC3).expected).toBe(9);
  });
});
