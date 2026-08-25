import { describe, it, expect } from "@jest/globals";
import {
  BANDS,
  TARGET,
  averageScore,
  bandFor,
  collectSkills,
  gapToTarget,
  toScore
} from "../src/pages/student/performance.js";

describe("toScore", () => {
  it("rounds to a whole number", () => {
    expect(toScore(72.4)).toBe(72);
    expect(toScore(72.5)).toBe(73);
  });

  it("clamps into 0-100", () => {
    expect(toScore(140)).toBe(100);
    expect(toScore(-20)).toBe(0);
  });

  it("treats anything unreadable as zero rather than NaN", () => {
    // The panel prints this straight into the page; NaN would reach the screen.
    expect(toScore(undefined)).toBe(0);
    expect(toScore(null)).toBe(0);
    expect(toScore("not a number")).toBe(0);
  });

  it("reads a numeric string, which is how the API sometimes sends it", () => {
    expect(toScore("83")).toBe(83);
  });
});

describe("bandFor", () => {
  it("puts the passing mark itself in the strong band", () => {
    expect(TARGET).toBe(60);
    expect(bandFor(60)).toBe(BANDS.strong);
    expect(bandFor(59)).toBe(BANDS.weak);
  });

  it("bands the extremes", () => {
    expect(bandFor(100).id).toBe("strong");
    expect(bandFor(0).id).toBe("weak");
  });
});

describe("gapToTarget", () => {
  it("is the distance still to climb", () => {
    expect(gapToTarget(45)).toBe(15);
  });

  it("is zero once the mark is reached, never negative", () => {
    expect(gapToTarget(60)).toBe(0);
    expect(gapToTarget(95)).toBe(0);
  });
});

describe("averageScore", () => {
  it("averages and rounds", () => {
    expect(averageScore([70, 80, 90])).toBe(80);
    expect(averageScore([70, 75])).toBe(73);
  });

  it("is zero for an empty list rather than NaN", () => {
    // A student with no scores yet must not be shown NaN%.
    expect(averageScore([])).toBe(0);
  });

  it("clamps each value before averaging", () => {
    expect(averageScore([200, 0])).toBe(50);
  });
});

describe("collectSkills", () => {
  const courses = [
    {
      id: "c1",
      title: "Strategic Planning",
      skills: [
        { topic: "Setting the Objective", score: 80 },
        { topic: "Formulating the Plan", score: 40 }
      ]
    },
    {
      id: "c2",
      title: "Operations",
      skills: [{ topic: "Scheduling", score: 55 }]
    }
  ];

  it("returns every skill across every course, weakest first", () => {
    const skills = collectSkills(courses);
    expect(skills.map((skill) => skill.score)).toEqual([40, 55, 80]);
  });

  it("tags each skill with the course it lives in", () => {
    const weakest = collectSkills(courses)[0];
    expect(weakest).toMatchObject({
      topic: "Formulating the Plan",
      courseId: "c1",
      courseTitle: "Strategic Planning"
    });
  });

  it("keys each skill uniquely, so two courses can share a topic name", () => {
    const shared = [
      { id: "c1", title: "One", skills: [{ topic: "Planning", score: 50 }] },
      { id: "c2", title: "Two", skills: [{ topic: "Planning", score: 70 }] }
    ];
    const keys = collectSkills(shared).map((skill) => skill.key);
    expect(new Set(keys).size).toBe(2);
  });

  it("copes with a course that has no skills yet", () => {
    expect(collectSkills([{ id: "c1", title: "Empty" }])).toEqual([]);
    expect(collectSkills([])).toEqual([]);
  });
});
