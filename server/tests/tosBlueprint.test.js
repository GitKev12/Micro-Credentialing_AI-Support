import { describe, it, expect } from "@jest/globals";
import { blueprintFromTos, rowDistribution } from "../src/assessments/assessments.blueprint.js";

/**
 * What the generator is told by a stored Table of Specification.
 *
 * The document now holds two blueprints rather than one. `rows` are the lesson
 * quizzes and have always been there; `final` is the examination's own table,
 * which the assessor writes on the blueprint screen.
 *
 * The distinction is the point. Before it, the assembler had only the quiz
 * rows and had to read them as if they answered a question they were never
 * asked: those rows say how long each *quiz* is, not how much of the *final*
 * each lesson carries. A course with ten-question quizzes therefore got a
 * final divided evenly ten ways, whatever the assessor wanted it to weigh.
 */

const M1 = "6b1f8fabafe387a98b8370a1";
const M2 = "6b1f8fabafe387a98b8370a2";

const legacyDoc = {
  courseId: "c1",
  examination: "Java Programming",
  rows: [
    { course: "Arrays", moduleId: M1, remember: 2, understand: 3, apply: 5 },
    { course: "Looping", moduleId: M2, remember: 2, understand: 3, apply: 5 }
  ]
};

const withFinal = {
  ...legacyDoc,
  final: {
    items: 40,
    levels: { remember: 4, understand: 6, apply: 6, analyze: 8, evaluate: 16, create: 0 },
    rows: [
      { moduleId: M1, coverage: "Arrays", target: 25, remember: 4, understand: 6, apply: 6, analyze: 9 },
      { moduleId: M2, coverage: "Looping", target: 15, evaluate: 15 }
    ]
  }
};

describe("rowDistribution", () => {
  it("names every level and adds them up", () => {
    const { distribution, items } = rowDistribution({ remember: 2, analyze: "3", junk: 9 });

    expect(items).toBe(5);
    expect(distribution).toEqual({
      remember: 2,
      understand: 0,
      apply: 0,
      analyze: 3,
      evaluate: 0,
      create: 0
    });
  });
});

describe("blueprintFromTos — the lesson quizzes", () => {
  it("reads each row as one lesson's quiz", () => {
    const blueprint = blueprintFromTos(legacyDoc);

    expect(blueprint.totalItems).toBe(20);
    expect(blueprint.itemsPerQuiz).toBe(10);
    expect(blueprint.rows).toHaveLength(2);
    expect(blueprint.rows[0].moduleId).toBe(M1);
  });
});

describe("blueprintFromTos — the final's own table", () => {
  /**
   * Every blueprint stored before the final had a table of its own has to go
   * on reading, or a course that was working stops generating the day the
   * screen ships.
   */
  it("is null on a document written before the final had one", () => {
    expect(blueprintFromTos(legacyDoc).final).toBeNull();
  });

  it("is null when the final block holds no rows", () => {
    expect(blueprintFromTos({ ...legacyDoc, final: { items: 40, rows: [] } }).final).toBeNull();
  });

  it("carries the length the assessor set for the examination", () => {
    expect(blueprintFromTos(withFinal).final.items).toBe(40);
  });

  it("keeps the share a lesson was promised beside what its row holds", () => {
    const [arrays, looping] = blueprintFromTos(withFinal).final.rows;

    expect(arrays.target).toBe(25);
    expect(arrays.items).toBe(25);
    expect(looping.target).toBe(15);
    expect(looping.items).toBe(15);
  });

  /**
   * The two are different facts — the target is the plan, the cells are the
   * distribution — so a blueprint saved while they disagree has to come back
   * still disagreeing rather than have one quietly overwrite the other.
   */
  it("reports a row whose cells do not match its share", () => {
    const doc = {
      ...withFinal,
      final: {
        ...withFinal.final,
        rows: [{ moduleId: M1, coverage: "Arrays", target: 10, remember: 3 }]
      }
    };
    const [row] = blueprintFromTos(doc).final.rows;

    expect(row.target).toBe(10);
    expect(row.items).toBe(3);
  });

  it("totals the matrix rather than trusting the stated length", () => {
    expect(blueprintFromTos(withFinal).final.totalItems).toBe(40);
  });

  /**
   * A blueprint can be saved before its length is typed. The matrix is then
   * the only statement of how long the paper is, and reading zero would leave
   * the assembler refusing a final that has a perfectly good table behind it.
   */
  it("falls back to the matrix when no length was stated", () => {
    const doc = { ...withFinal, final: { ...withFinal.final, items: 0 } };
    expect(blueprintFromTos(doc).final.items).toBe(40);
  });

  it("names every level of the cognitive split, set or not", () => {
    expect(blueprintFromTos(withFinal).final.levels).toEqual({
      remember: 4,
      understand: 6,
      apply: 6,
      analyze: 8,
      evaluate: 16,
      create: 0
    });
  });

  it("gives each row the distribution the assembler draws by", () => {
    const [arrays] = blueprintFromTos(withFinal).final.rows;

    expect(arrays.distribution).toEqual({
      remember: 4,
      understand: 6,
      apply: 6,
      analyze: 9,
      evaluate: 0,
      create: 0
    });
  });
});
