import { describe, it, expect } from "@jest/globals";
import { SKILL_THRESHOLD, skillGapFromFinal } from "../src/skillgap/skillgap.service.js";

/** A graded result in the shape the assessments controller writes. */
const result = (items) => ({ aiGrading: { status: "graded", items } });

const answered = (itemId, moduleId, verdict, topic = "") => ({
  itemId,
  moduleId,
  topic,
  verdict
});

/** A final whose blueprint asked 4 items of each of two lessons. */
const finalExam = {
  items: [],
  topics: [
    { moduleId: "m1", topic: "Setting the Objective" },
    { moduleId: "m2", topic: "Formulating the Plan" }
  ],
  itemsPerModule: { m1: 4, m2: 4 }
};

describe("skillGapFromFinal", () => {
  it("returns null when the paper has nothing to break down", () => {
    // An empty breakdown and a breakdown of zeros say very different things.
    expect(skillGapFromFinal(result([]), finalExam)).toBeNull();
    expect(skillGapFromFinal({}, finalExam)).toBeNull();
  });

  it("returns null when no answered item names a lesson", () => {
    const noLessons = result([answered("1", null, "correct"), answered("2", null, "incorrect")]);
    expect(skillGapFromFinal(noLessons, finalExam)).toBeNull();
  });

  it("scores each lesson out of what the blueprint asked, not what was answered", () => {
    // Only 2 of m1's 4 items came back, both correct. Scoring out of 2 would
    // report 100% on a lesson the student half-skipped.
    const sat = result([
      answered("a1", "m1", "correct"),
      answered("a2", "m1", "correct"),
      answered("b1", "m2", "correct"),
      answered("b2", "m2", "correct"),
      answered("b3", "m2", "incorrect"),
      answered("b4", "m2", "incorrect")
    ]);

    const gap = skillGapFromFinal(sat, finalExam);
    const m1 = gap.skills.find((skill) => skill.moduleId === "m1");
    const m2 = gap.skills.find((skill) => skill.moduleId === "m2");

    expect(m1.total).toBe(4);
    expect(m1.correct).toBe(2);
    expect(m1.score).toBe(50);
    expect(m2.score).toBe(50);
  });

  it("marks a lesson weak below 60 and strong at or above it", () => {
    expect(SKILL_THRESHOLD).toBe(60);

    const sat = result([
      // m1: 3 of 4 asked = 75% — strong.
      answered("a1", "m1", "correct"),
      answered("a2", "m1", "correct"),
      answered("a3", "m1", "correct"),
      answered("a4", "m1", "incorrect"),
      // m2: 2 of 4 asked = 50% — weak.
      answered("b1", "m2", "correct"),
      answered("b2", "m2", "correct"),
      answered("b3", "m2", "incorrect"),
      answered("b4", "m2", "incorrect")
    ]);

    const gap = skillGapFromFinal(sat, finalExam);
    expect(gap.skills.find((skill) => skill.moduleId === "m1")).toMatchObject({
      score: 75,
      label: "strong"
    });
    expect(gap.skills.find((skill) => skill.moduleId === "m2")).toMatchObject({
      score: 50,
      label: "weak"
    });
  });

  it("normalises the weights so they sum to 1", () => {
    const sat = result([
      answered("a1", "m1", "correct"),
      answered("a2", "m1", "correct"),
      answered("a3", "m1", "correct"),
      answered("b1", "m2", "correct"),
      answered("b2", "m2", "incorrect")
    ]);

    const gap = skillGapFromFinal(sat, finalExam);
    const sum = gap.skills.reduce((total, skill) => total + skill.weight, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it("weights every lesson at zero when nothing was answered correctly", () => {
    // The only honest weighting of a blank paper.
    const blank = result([
      answered("a1", "m1", "incorrect"),
      answered("b1", "m2", "incorrect")
    ]);

    const gap = skillGapFromFinal(blank, finalExam);
    expect(gap.skills.every((skill) => skill.weight === 0)).toBe(true);
    expect(gap.performance).toBe(0);
  });

  it("reports overall performance as the exam mark, not the weighted figure", () => {
    // A student who answered 6 of 8 was once shown 98% above two topics marked
    // weak at 0%, because the weighted figure drops any topic nobody scored in.
    const sat = result([
      answered("a1", "m1", "correct"),
      answered("a2", "m1", "correct"),
      answered("a3", "m1", "correct"),
      answered("a4", "m1", "correct"),
      answered("b1", "m2", "incorrect"),
      answered("b2", "m2", "incorrect"),
      answered("b3", "m2", "incorrect"),
      answered("b4", "m2", "incorrect")
    ]);

    const gap = skillGapFromFinal(sat, finalExam);
    expect(gap.itemsAsked).toBe(8);
    expect(gap.itemsCorrect).toBe(4);
    expect(gap.performance).toBe(50);
    // The weighted figure ignores m2 entirely, which is why it is not the one
    // printed as the exam result.
    expect(gap.weightedPerformance).toBe(100);
  });

  it("reads the verdicts the key wrote, with nothing overriding them", () => {
    // Marking happens once, when the paper is handed in. There is no second
    // pass an assessor could use to overrule an item, so the breakdown is the
    // key's answer and cannot drift from the score printed above it.
    const items = [
      answered("a1", "m1", "correct"),
      answered("a2", "m1", "correct"),
      answered("a3", "m1", "incorrect"),
      answered("a4", "m1", "incorrect")
    ];

    const gap = skillGapFromFinal(result(items), finalExam);

    expect(gap.skills.find((skill) => skill.moduleId === "m1").correct).toBe(2);
    expect(gap.skills.find((skill) => skill.moduleId === "m1").score).toBe(50);
  });

  it("lists lessons in the paper's order, not weakest first", () => {
    // A ranking of a course's own lessons reads as if the syllabus had been
    // reshuffled; the panel that wants weakest-first sorts for itself.
    const sat = result([
      answered("a1", "m1", "incorrect"),
      answered("b1", "m2", "correct")
    ]);

    const gap = skillGapFromFinal(sat, finalExam);
    expect(gap.skills.map((skill) => skill.moduleId)).toEqual(["m1", "m2"]);
  });

  it("falls back to the assessment when a result predates items carrying a lesson", () => {
    const legacy = result([
      { itemId: "a1", verdict: "correct" },
      { itemId: "b1", verdict: "incorrect" }
    ]);
    const withItemLessons = {
      ...finalExam,
      items: [
        { id: "a1", moduleId: "m1" },
        { id: "b1", moduleId: "m2" }
      ]
    };

    const gap = skillGapFromFinal(legacy, withItemLessons);
    expect(gap.skills.map((skill) => skill.moduleId).sort()).toEqual(["m1", "m2"]);
  });

  it("labels a lesson the paper never named rather than leaving it blank", () => {
    const sat = result([answered("x1", "m9", "correct")]);
    const gap = skillGapFromFinal(sat, { items: [], topics: [], itemsPerModule: {} });
    expect(gap.skills[0].topic).toBe("Untitled lesson");
  });
});
