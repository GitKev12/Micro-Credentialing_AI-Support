import { describe, it, expect } from "@jest/globals";
import {
  DEFAULT_PASS_RATIO,
  defaultPassMark,
  gradeSubmission,
  normalizeAssessment,
  normalizeItem,
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

  it("counts the paper rather than what an older document claimed it was worth", () => {
    // A paper written while assessments held a bank carries the totals of the
    // shorter paper that used to be drawn out of it. Marking today's sitting
    // against those would let a student score fifteen out of five.
    const assessment = normalizeAssessment(
      doc([mc("1"), mc("2"), mc("3")], { itemsPerAttempt: 1, totalPoints: 1, passMark: 1 })
    );

    expect(assessment.itemCount).toBe(3);
    expect(assessment.totalPoints).toBe(3);
    expect(assessment.passMark).toBe(2);
  });

  it("treats an assessment belonging to no lesson as the final", () => {
    expect(normalizeAssessment(doc([mc("1")], { moduleId: null })).scope).toBe("final");
    expect(normalizeAssessment(doc([mc("1")])).scope).toBe("lesson");
  });
});

describe("toStudentAssessment", () => {
  const questions = [mc("1"), mc("2"), mc("3"), mc("4"), mc("5"), mc("6")];

  it("never sends the answer key to the browser", () => {
    // The boundary the whole quiz rests on: with the key attached, every paper
    // is self-solving.
    const served = toStudentAssessment(doc(questions));
    for (const item of served.items) {
      expect(item).not.toHaveProperty("key");
    }
    expect(JSON.stringify(served)).not.toContain('"key"');
  });

  it("serves every question on the paper", () => {
    // There is no bank to hold anything back from: the paper is its questions,
    // and what makes two sittings differ is their order.
    const served = toStudentAssessment(doc(questions));
    expect(served.items).toHaveLength(questions.length);
    expect(served.items.map((item) => item.id).sort()).toEqual(
      questions.map((item) => item.id).sort()
    );
  });

  it("strips the lesson tags the paper is scored by", () => {
    const tagged = [mc("1", "a", { moduleId: "module-9", topic: "Planning" })];
    const served = toStudentAssessment(doc(tagged));
    expect(served.items[0]).not.toHaveProperty("moduleId");
    expect(served.items[0]).not.toHaveProperty("topic");
  });
});

describe("a paper is its questions", () => {
  it("serves a final's whole quota, so every lesson is examined", () => {
    // Skill gap analysis reports one score per lesson and divides by that
    // lesson's quota — a paper missing a lesson entirely is one it cannot
    // report on.
    const finalDoc = doc(
      [
        mc("a1", "a", { moduleId: "m1" }),
        mc("a2", "a", { moduleId: "m1" }),
        mc("b1", "a", { moduleId: "m2" }),
        mc("b2", "a", { moduleId: "m2" })
      ],
      { moduleId: null, scope: "final", itemsPerModule: { m1: 2, m2: 2 } }
    );

    const served = toStudentAssessment(finalDoc, { shuffle: false });
    const perModule = normalizeAssessment(finalDoc).items.reduce((counts, item) => {
      counts[item.moduleId] = (counts[item.moduleId] ?? 0) + 1;
      return counts;
    }, {});

    expect(served.items).toHaveLength(4);
    expect(perModule).toEqual({ m1: 2, m2: 2 });
  });

  it("serves the same questions on every sitting, whatever the order", () => {
    // A retake is the same paper. Nothing is held back for a second attempt,
    // which is exactly why the bank went: an unlimited lesson quiz never
    // reached the questions it was hiding.
    const paper = doc([mc("1"), mc("2"), mc("3"), mc("4")]);

    const first = toStudentAssessment(paper).items.map((item) => item.id).sort();
    const second = toStudentAssessment(paper).items.map((item) => item.id).sort();

    expect(second).toEqual(first);
  });
});

describe("gradeSubmission", () => {
  const questions = [mc("1", "a"), mc("2", "b"), mc("3", "c"), mc("4", "d")];
  const paper = doc(questions);
  const servedIds = () => questions.map((item) => item.id);
  const keyById = new Map(questions.map((item) => [item.id, item.key]));

  it("marks every served item against its key", () => {
    const answers = servedIds().map((id) => ({ itemId: id, choice: keyById.get(id) }));

    const graded = gradeSubmission(paper, answers);
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
    const graded = gradeSubmission(paper, []);
    expect(graded.correct).toBe(0);
    expect(graded.items).toHaveLength(4);
    expect(graded.items.every((item) => item.verdict === "incorrect")).toBe(true);
    expect(graded.passed).toBe(false);
  });

  it("ignores answers to questions the student was never served", () => {
    // A client that could name its own questions could name the easy ones.
    const graded = gradeSubmission(paper, [{ itemId: "not-on-this-paper", choice: "a" }]);
    expect(graded.items).toHaveLength(4);
    expect(graded.servedItemIds).not.toContain("not-on-this-paper");
  });

  it("records which paper was served, so a submission can be read against it", () => {
    const graded = gradeSubmission(paper, []);
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
