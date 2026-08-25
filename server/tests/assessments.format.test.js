import { describe, it, expect } from "@jest/globals";
import {
  DEFAULT_PASS_RATIO,
  defaultPassMark,
  gradeSubmission,
  normalizeAssessment,
  normalizeItem,
  selectItemsFor,
  toStudentAssessment,
  validateAssessment
} from "../src/assessments/assessments.format.js";

/** A multiple-choice item in the shape the generator writes. */
const mc = (id, key = "a", extra = {}) => ({
  id,
  q: `Question ${id}`,
  type: "multiple-choice",
  choices: [
    { id: "a", text: "First" },
    { id: "b", text: "Second" },
    { id: "c", text: "Third" },
    { id: "d", text: "Fourth" }
  ],
  key,
  ...extra
});

const doc = (items, extra = {}) => ({
  _id: "assessment-1",
  title: "Sample paper",
  courseId: "course-1",
  moduleId: "module-1",
  items,
  ...extra
});

describe("defaultPassMark", () => {
  it("is 60% of the total, rounded up", () => {
    expect(DEFAULT_PASS_RATIO).toBe(0.6);
    expect(defaultPassMark(50)).toBe(30);
    expect(defaultPassMark(15)).toBe(9);
    // 7 * 0.6 = 4.2 — a student needs the whole 5th mark, not four-and-a-bit.
    expect(defaultPassMark(7)).toBe(5);
  });

  it("treats a missing total as zero rather than NaN", () => {
    expect(defaultPassMark(undefined)).toBe(0);
    expect(defaultPassMark(null)).toBe(0);
  });
});

describe("normalizeItem", () => {
  it("letters plain-string choices so every item has ids to answer against", () => {
    const item = normalizeItem({ q: "Pick one", choices: ["First", "Second", "Third"], key: "b" }, 0);
    expect(item.choices).toEqual([
      { id: "a", text: "First" },
      { id: "b", text: "Second" },
      { id: "c", text: "Third" }
    ]);
  });

  it("normalizes a true-false item into the same choices-and-key shape", () => {
    const item = normalizeItem({ q: "Is it so?", type: "true-false", key: true }, 0);
    expect(item.choices).toEqual([
      { id: "true", text: "True" },
      { id: "false", text: "False" }
    ]);
    expect(item.key).toBe("true");
  });

  it("accepts the strings a form would send for a true-false key", () => {
    expect(normalizeItem({ q: "Q", type: "true-false", key: "Yes" }, 0).key).toBe("true");
    expect(normalizeItem({ q: "Q", type: "true-false", key: "f" }, 0).key).toBe("false");
  });

  it("drops an item whose key names no real choice", () => {
    // Keeping it would mark every student wrong, which is worse than losing it.
    expect(normalizeItem(mc("1", "z"), 0)).toBeNull();
  });

  it("drops an item with no question, and one with too few choices", () => {
    expect(normalizeItem({ q: "", choices: ["a", "b"], key: "a" }, 0)).toBeNull();
    expect(normalizeItem({ q: "Only one option", choices: ["Just this"], key: "a" }, 0)).toBeNull();
  });
});

describe("normalizeAssessment", () => {
  it("defaults the pass mark from the total when the document does not state one", () => {
    const assessment = normalizeAssessment(doc([mc("1"), mc("2"), mc("3"), mc("4"), mc("5")]));
    expect(assessment.totalPoints).toBe(5);
    expect(assessment.passMark).toBe(3);
  });

  it("keeps a stored pass mark, which was a decision someone made", () => {
    const assessment = normalizeAssessment(doc([mc("1"), mc("2")], { passMark: 2 }));
    expect(assessment.passMark).toBe(2);
  });

  it("cannot serve more items than the bank holds", () => {
    const assessment = normalizeAssessment(doc([mc("1"), mc("2")], { itemsPerAttempt: 10 }));
    expect(assessment.itemsPerAttempt).toBe(2);
  });

  it("treats an assessment belonging to no lesson as the final", () => {
    expect(normalizeAssessment(doc([mc("1")], { moduleId: null })).scope).toBe("final");
    expect(normalizeAssessment(doc([mc("1")])).scope).toBe("lesson");
  });
});

describe("toStudentAssessment", () => {
  const bank = [mc("1"), mc("2"), mc("3"), mc("4"), mc("5"), mc("6")];

  it("never sends the answer key to the browser", () => {
    // The boundary the whole quiz rests on: with the key attached, every paper
    // is self-solving.
    const served = toStudentAssessment(doc(bank), { studentId: "student-1" });
    for (const item of served.items) {
      expect(item).not.toHaveProperty("key");
    }
    expect(JSON.stringify(served)).not.toContain('"key"');
  });

  it("does not send the bank a student was not asked", () => {
    const served = toStudentAssessment(doc(bank, { itemsPerAttempt: 3 }), { studentId: "student-1" });
    expect(served.items).toHaveLength(3);
    expect(served.items.length).toBeLessThan(bank.length);
  });

  it("strips the lesson tags the paper is scored by", () => {
    const tagged = [mc("1", "a", { moduleId: "module-9", topic: "Planning" })];
    const served = toStudentAssessment(doc(tagged), { studentId: "student-1" });
    expect(served.items[0]).not.toHaveProperty("moduleId");
    expect(served.items[0]).not.toHaveProperty("topic");
  });
});

describe("selectItemsFor", () => {
  const assessment = normalizeAssessment(
    doc([mc("1"), mc("2"), mc("3"), mc("4"), mc("5"), mc("6")], { itemsPerAttempt: 3 })
  );

  it("gives the same student the same paper every time", () => {
    // A reload must not cost a student their answers, and must not let them
    // refresh until an easier paper comes up.
    const first = selectItemsFor(assessment, "student-1").map((item) => item.id);
    const second = selectItemsFor(assessment, "student-1").map((item) => item.id);
    expect(second).toEqual(first);
  });

  it("draws a final per lesson, to the quota the blueprint set", () => {
    const finalDoc = doc(
      [
        mc("a1", "a", { moduleId: "m1" }),
        mc("a2", "a", { moduleId: "m1" }),
        mc("a3", "a", { moduleId: "m1" }),
        mc("b1", "a", { moduleId: "m2" }),
        mc("b2", "a", { moduleId: "m2" }),
        mc("b3", "a", { moduleId: "m2" })
      ],
      { moduleId: null, scope: "final", itemsPerAttempt: 4, itemsPerModule: { m1: 2, m2: 2 } }
    );

    const drawn = selectItemsFor(normalizeAssessment(finalDoc), "student-1");
    const perModule = drawn.reduce((counts, item) => {
      counts[item.moduleId] = (counts[item.moduleId] ?? 0) + 1;
      return counts;
    }, {});

    // A plain sample could miss a lesson entirely, which skill gap analysis
    // cannot report on and cannot divide by.
    expect(perModule).toEqual({ m1: 2, m2: 2 });
  });
});

describe("gradeSubmission", () => {
  const bank = [mc("1", "a"), mc("2", "b"), mc("3", "c"), mc("4", "d")];
  const paper = doc(bank, { passMark: 3 });
  const servedIds = () => selectItemsFor(normalizeAssessment(paper), "student-1").map((item) => item.id);
  const keyById = new Map(bank.map((item) => [item.id, item.key]));

  it("marks every served item against its key", () => {
    const answers = servedIds().map((id) => ({ itemId: id, choice: keyById.get(id) }));

    const graded = gradeSubmission(paper, answers, { studentId: "student-1" });
    expect(graded.correct).toBe(4);
    expect(graded.score).toBe(4);
    expect(graded.passed).toBe(true);
  });

  it("compares the answer case-insensitively", () => {
    const answers = servedIds().map((id) => ({
      itemId: id,
      choice: String(keyById.get(id)).toUpperCase()
    }));

    expect(gradeSubmission(paper, answers, { studentId: "student-1" }).correct).toBe(4);
  });

  it("counts an unanswered item as incorrect rather than skipping it", () => {
    const graded = gradeSubmission(paper, [], { studentId: "student-1" });
    expect(graded.correct).toBe(0);
    expect(graded.items).toHaveLength(4);
    expect(graded.items.every((item) => item.verdict === "incorrect")).toBe(true);
    expect(graded.passed).toBe(false);
  });

  it("ignores answers to questions the student was never served", () => {
    // A client that could name its own questions could name the easy ones.
    const graded = gradeSubmission(paper, [{ itemId: "not-on-this-paper", choice: "a" }], {
      studentId: "student-1"
    });
    expect(graded.items).toHaveLength(4);
    expect(graded.servedItemIds).not.toContain("not-on-this-paper");
  });

  it("records which paper was sat, for the assessor to review", () => {
    const graded = gradeSubmission(paper, [], { studentId: "student-1" });
    expect(graded.servedItemIds).toEqual(servedIds());
  });
});

describe("validateAssessment", () => {
  it("passes a well-formed paper", () => {
    expect(validateAssessment(doc([mc("1"), mc("2")])).problems).toEqual([]);
  });

  it("reports an unusable item instead of throwing", () => {
    // The AI generator is the caller this exists for: it retries against the
    // specific complaint.
    const { problems } = validateAssessment(doc([mc("1"), mc("2", "z")]));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).toMatch(/unusable/i);
  });
});
