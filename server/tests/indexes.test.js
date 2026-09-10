import { describe, it, expect } from "@jest/globals";
import { CORE_INDEXES, summarise } from "../src/lib/indexes.js";

const keysFor = (name) =>
  CORE_INDEXES.filter(([coll]) => coll === name).map(([, key]) => Object.keys(key));

/** MongoDB's prefix rule: an index serves a filter when its first field is in it. */
const serves = (name, fields) => keysFor(name).some((keys) => fields.includes(keys[0]));

describe("the declared index set", () => {
  it("gives every key a collection, a key object and at most one options object", () => {
    for (const [name, key, options] of CORE_INDEXES) {
      expect(typeof name).toBe("string");
      expect(Object.keys(key).length).toBeGreaterThan(0);
      for (const direction of Object.values(key)) expect(direction).toBe(1);
      if (options !== undefined) expect(typeof options).toBe("object");
    }
  });

  it("declares no key twice", () => {
    const seen = CORE_INDEXES.map(([name, key]) => `${name}:${Object.keys(key).join(",")}`);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("only claims uniqueness where the domain actually is unique", () => {
    const unique = CORE_INDEXES.filter(([, , o]) => o?.unique).map(
      ([name, key]) => `${name}:${Object.keys(key).join(",")}`
    );
    // A student completes a lesson once; a lesson has one extracted text;
    // and a student has a given paper open once, not twice — a second row
    // for the same pair would count one student twice on the generate
    // screen, which is the whole reason that one is written this way.
    expect(unique).toEqual([
      "ModuleProgress:studentId,moduleId",
      "AssessmentAttempt:studentId,assessmentId",
      "ModuleText:moduleId"
    ]);
  });
});

// These are the filters found in the server by scripts/check-index-coverage.mjs.
// Pinning them here means removing an index fails a test rather than quietly
// turning a page load back into a collection scan.
describe("the query shapes the server actually issues", () => {
  const cases = [
    ["ModuleProgress", ["studentId"], "a student's completions"],
    ["ModuleProgress", ["studentId", "courseId"], "completions within a course"],
    ["ModuleProgress", ["studentId", "moduleId"], "the completion upsert key"],
    ["ModuleProgress", ["courseId"], "a whole class's progress"],
    ["ModuleProgress", ["moduleId"], "purging a lesson's completions"],

    ["StudentResult", ["studentId", "courseId"], "a student's results in a course"],
    ["StudentResult", ["studentId", "assessmentId"], "the skill gap and the release path"],
    ["StudentResult", ["studentId", "superseded"], "the live attempt per student"],
    ["StudentResult", ["courseId"], "an assessor's course-wide read"],
    ["StudentResult", ["assessmentId"], "every result for one paper"],

    ["LearningModule", ["courseId"], "a course's lessons"],
    ["LearningModule", ["courseCode"], "the same, by code"],

    ["ModuleText", ["moduleId"], "a lesson's extracted text"],

    ["Class", ["studentIds"], "which classes a student is in"],
    ["Class", ["studentIds", "courseId"], "the student access check"],
    ["Class", ["assessorIds", "courseId"], "the assessor membership check"],

    ["Course", ["courseCode"], "course lookup by code"],
    ["Course", ["code"], "the legacy $or branch beside it"]
  ];

  for (const [name, fields, what] of cases) {
    it(`serves ${what} — ${name} {${fields.join(", ")}}`, () => {
      expect(serves(name, fields)).toBe(true);
    });
  }

  // An $or is only served when every branch is. Both of these run together on
  // nearly every screen, so dropping either turns the lesson list into a scan.
  it("serves both branches of the courseId/courseCode $or on lessons", () => {
    expect(serves("LearningModule", ["courseId"])).toBe(true);
    expect(serves("LearningModule", ["courseCode"])).toBe(true);
  });

  // The lookup offers _id, courseCode and the legacy `code`. _id carries
  // MongoDB's own index and is never declared here, so only the other two have
  // to be — but all three must be served or the $or scans.
  it("serves both declarable branches of the course lookup $or", () => {
    expect(serves("Course", ["courseCode"])).toBe(true);
    expect(serves("Course", ["code"])).toBe(true);
  });
});

describe("summarise", () => {
  it("says so plainly when there was no database to index", () => {
    expect(summarise({ ran: false, reason: "database-not-connected", results: [] })).toBe(
      "Indexes: skipped (database-not-connected)."
    );
  });

  it("counts the outcomes and names the ones that need attention", () => {
    const line = summarise({
      ran: true,
      results: [
        { name: "A", key: "x", state: "created" },
        { name: "A", key: "y", state: "created" },
        { name: "B", key: "z", state: "created-non-unique", reason: "duplicates present" },
        { name: "C", key: "w", state: "failed", reason: "boom" }
      ]
    });

    expect(line).toContain("2 created");
    expect(line).toContain("B.z — duplicates present");
    expect(line).toContain("C.w — boom");
  });
});
