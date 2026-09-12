import { describe, it, expect } from "@jest/globals";
import { gradeSubmission, toMarkedPaper } from "../src/assessments/assessments.format.js";

/**
 * The paper an assessor reads back off a submission.
 *
 * Its whole job is to put three things side by side that live in two different
 * documents — the question, the answer it was marked against, and what the
 * student put down — without changing any of them.
 */

const paper = (overrides = {}) => ({
  _id: "a1",
  courseId: "c1",
  scope: "lesson",
  status: "posted",
  title: "Creating Java Programs",
  pointsPerItem: 1,
  totalPoints: 3,
  passMark: 2,
  items: [
    {
      id: "i1",
      n: 1,
      type: "multiple-choice",
      q: "Which keyword declares a class?",
      choices: [
        { id: "a", text: "class" },
        { id: "b", text: "struct" },
        { id: "c", text: "define" }
      ],
      key: "a"
    },
    {
      id: "i2",
      n: 2,
      type: "multiple-choice",
      q: "Which method starts a Java program?",
      choices: [
        { id: "a", text: "start()" },
        { id: "b", text: "main()" },
        { id: "c", text: "run()" }
      ],
      key: "b"
    },
    {
      id: "i3",
      n: 3,
      type: "true-false",
      q: "Java is case sensitive.",
      choices: [
        { id: "true", text: "True" },
        { id: "false", text: "False" }
      ],
      key: "true"
    }
  ],
  ...overrides
});

/** A submission marked the way the submit endpoint marks one. */
const submission = (answers) => ({
  answers,
  aiGrading: { status: "graded", ...gradeSubmission(paper(), answers) }
});

describe("toMarkedPaper", () => {
  it("puts the key and the student's answer against every question", () => {
    const marked = toMarkedPaper(
      paper(),
      submission([
        { itemId: "i1", choice: "a" },
        { itemId: "i2", choice: "c" },
        { itemId: "i3", choice: "true" }
      ])
    );

    expect(marked.items.map((item) => [item.n, item.key, item.chosen, item.verdict])).toEqual([
      [1, "a", "a", "correct"],
      [2, "b", "c", "incorrect"],
      [3, "true", "true", "correct"]
    ]);
    expect(marked.correct).toBe(2);
    expect(marked.itemCount).toBe(3);
  });

  /**
   * The student's own review is never given the key (see toStudentAssessment).
   * This is the screen that is, and an assessor deciding whether a question is
   * broken cannot decide it without seeing the answer it was marked against.
   */
  it("keeps the key, which the student's own copy of the paper strips", () => {
    const marked = toMarkedPaper(paper(), submission([{ itemId: "i1", choice: "a" }]));
    expect(marked.items.every((item) => typeof item.key === "string")).toBe(true);
  });

  /**
   * Blank and wrong both score nothing, but they are different facts about the
   * attempt: one says the student did not know, the other that they ran out of
   * time. The mark is unchanged either way — an unanswered question is still
   * incorrect, because that is what it was scored as.
   */
  it("tells a question left blank from one answered wrongly", () => {
    const marked = toMarkedPaper(
      paper(),
      submission([
        { itemId: "i1", choice: "b" },
        { itemId: "i2", choice: "" }
      ])
    );

    const [wrong, blank] = marked.items;
    expect(wrong).toMatchObject({ chosen: "b", answered: true, verdict: "incorrect" });
    expect(blank).toMatchObject({ chosen: null, answered: false, verdict: "incorrect" });
    expect(marked.answered).toBe(1);
  });

  /**
   * The mark was made at hand-in and it is final. If the paper is edited
   * afterwards, the screen still has to report the mark the student was given
   * — working out a fresh verdict here would show them a different result from
   * the one on their record.
   */
  it("reports the mark that was made, not one worked out from the paper as it stands now", () => {
    const handedIn = submission([{ itemId: "i1", choice: "a" }]);

    // The assessor corrects the key afterwards: b is the right answer now.
    const corrected = paper();
    corrected.items[0].key = "b";

    const marked = toMarkedPaper(corrected, handedIn);
    expect(marked.items[0].chosen).toBe("a");
    expect(marked.items[0].verdict).toBe("correct");
  });

  // Submissions stored before per-item verdicts were kept have only the answers
  // that were sent. Those are still readable, against the key as it stands.
  it("falls back to the answers when a submission has no per-item marks", () => {
    const marked = toMarkedPaper(paper(), {
      answers: [
        { itemId: "i1", choice: "a" },
        { itemId: "i2", choice: "a" }
      ]
    });

    expect(marked.items[0]).toMatchObject({ chosen: "a", verdict: "correct" });
    expect(marked.items[1]).toMatchObject({ chosen: "a", verdict: "incorrect" });
    expect(marked.items[2]).toMatchObject({ chosen: null, answered: false });
  });

  /**
   * Regenerating replaces a paper's questions outright. The mark stands — it
   * was made against the paper as served — but the screen can only show what
   * is still there, so it has to count what it cannot show rather than quietly
   * displaying a shorter paper.
   */
  it("counts the answered questions that are no longer on the paper", () => {
    const handedIn = submission([
      { itemId: "i1", choice: "a" },
      { itemId: "i2", choice: "b" },
      { itemId: "i3", choice: "true" }
    ]);

    const regenerated = paper({
      items: [
        {
          id: "new1",
          n: 1,
          type: "multiple-choice",
          q: "A question written after they took it.",
          choices: [
            { id: "a", text: "One" },
            { id: "b", text: "Two" }
          ],
          key: "a"
        }
      ]
    });

    const marked = toMarkedPaper(regenerated, handedIn);
    expect(marked.missing).toBe(3);
    expect(marked.itemCount).toBe(1);
    expect(marked.items[0].chosen).toBeNull();
  });

  // The assessor reading a badly-answered tracing question needs the code the
  // class traced and the reason the key was set, or they cannot tell a hard
  // question from a wrong one.
  it("shows the code each question was about and why its key is right", () => {
    const traced = paper();
    traced.items[1] = {
      ...traced.items[1],
      code: "public static void main(String[] args) {\n    System.out.println(\"Hi\");\n}",
      explanation: "The JVM starts every application at main()."
    };

    const marked = toMarkedPaper(traced, submission([{ itemId: "i2", choice: "b" }]));

    expect(marked.items[1].code).toBe(
      "public static void main(String[] args) {\n    System.out.println(\"Hi\");\n}"
    );
    expect(marked.items[1].explanation).toBe("The JVM starts every application at main().");
    expect(marked.items[0].code).toBeNull();
  });

  it("has nothing to show for a paper that is not there", () => {
    expect(toMarkedPaper(null, submission([]))).toBeNull();
  });
});
