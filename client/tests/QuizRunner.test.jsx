import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

/**
 * What a student is shown when they open a quiz that is not open.
 *
 * The rail's row used to be a disabled button, so this panel was unreachable
 * for the case it exists to explain — a student could not press a locked quiz
 * and therefore never read why it was locked. The row opens now, and this is
 * the answer to the press.
 */

const fetchAssessment = jest.fn();
const submitAssessment = jest.fn();

jest.unstable_mockModule("../src/services/assessments.js", () => ({
  fetchAssessment,
  submitAssessment
}));

let QuizRunner;

beforeAll(async () => {
  QuizRunner = (await import("../src/pages/student/components/QuizRunner.jsx")).default;
});

beforeEach(() => {
  fetchAssessment.mockReset();
  submitAssessment.mockReset();
});

const draw = (assessment, onOpenLesson = null) =>
  render(
    <QuizRunner
      studentId="stu-1"
      assessment={assessment}
      onSubmitted={() => {}}
      onBadgeEarned={() => {}}
      onOpenLesson={onOpenLesson}
    />
  );

const PLACEHOLDER = {
  id: "placeholder:lesson:m1",
  scope: "lesson",
  title: "",
  placeholder: true,
  locked: true,
  reason: "Your assessor will unlock this quiz."
};

describe("QuizRunner — a quiz that is not open yet", () => {
  it("says who opens it", async () => {
    draw(PLACEHOLDER);

    expect(
      await screen.findByText("Your assessor will unlock this quiz.")
    ).toBeInTheDocument();
  });

  /**
   * A placeholder's id resolves to no document, so asking for it comes back a
   * 404 — which would be shown as a quiz that failed to load, and that is not
   * what happened to it.
   */
  it("does not go looking for a paper that was never written", () => {
    draw(PLACEHOLDER);

    expect(fetchAssessment).not.toHaveBeenCalled();
  });

  it("falls back to a sentence of its own when the row carries no reason", async () => {
    draw({ ...PLACEHOLDER, reason: undefined });

    expect(
      await screen.findByText("Your assessor will unlock this quiz.")
    ).toBeInTheDocument();
  });

  /**
   * A real paper that is merely shut is still asked for: the server decides,
   * and its reason is the current one where the rail's may be a moment stale.
   */
  it("takes the server's reason for a paper that does exist", async () => {
    fetchAssessment.mockResolvedValue({
      locked: true,
      message: "Finish the lesson to open this quiz."
    });

    draw({ id: "a1", scope: "lesson", title: "Java Basics", locked: true });

    expect(
      await screen.findByText("Finish the lesson to open this quiz.")
    ).toBeInTheDocument();
    expect(fetchAssessment).toHaveBeenCalledWith("stu-1", "a1");
  });
});

/**
 * A locked panel used to be a sentence and nothing else, which left the
 * student holding a reason with no way to act on it. Where the reason is the
 * lesson being unfinished, the lesson is one press away.
 */
describe("QuizRunner — the way out of a shut quiz", () => {
  it("offers the lesson when that is what is holding it", async () => {
    const openLesson = jest.fn();
    draw(PLACEHOLDER, openLesson);

    fireEvent.click(await screen.findByRole("button", { name: "Go to the lesson" }));

    expect(openLesson).toHaveBeenCalled();
  });

  it("offers nothing to press when there is nothing the student can do", async () => {
    draw(PLACEHOLDER);

    await screen.findByText("Your assessor will unlock this quiz.");
    expect(screen.queryByRole("button", { name: "Go to the lesson" })).toBeNull();
  });
});

/**
 * Handing the paper in.
 *
 * Submit used to be a second button in a row of its own, on screen from the
 * first question and greyed out for all but the end of the paper. It is the
 * same button as Next now, and reaching the last question is what turns one
 * into the other — so the only control in that corner is always the one the
 * student can actually use.
 */
const PAPER = { id: "a2", scope: "lesson", title: "Java Basics" };

const ready = () => ({
  assessment: {
    id: "a2",
    itemCount: 2,
    passMark: 1,
    totalPoints: 2,
    items: [
      {
        id: "q1",
        type: "multiple-choice",
        q: "What does the compiler read?",
        choices: [
          { id: "c1", text: "Source" },
          { id: "c2", text: "Bytecode" }
        ]
      },
      {
        id: "q2",
        type: "true-false",
        q: "Java is compiled.",
        choices: [
          { id: "t", text: "True" },
          { id: "f", text: "False" }
        ]
      }
    ]
  }
});

describe("QuizRunner — handing the paper in", () => {
  it("offers only Next while there are questions left", async () => {
    fetchAssessment.mockResolvedValue(ready());

    draw(PAPER);
    await screen.findByText("What does the compiler read?");

    expect(screen.getByRole("button", { name: "Next question" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit quiz" })).toBeNull();
  });

  it("turns that button into Submit on the last question", async () => {
    fetchAssessment.mockResolvedValue(ready());

    draw(PAPER);
    await screen.findByText("What does the compiler read?");
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));

    expect(screen.getByRole("button", { name: "Submit quiz" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next question" })).toBeNull();
  });

  /** Skip is what reaches the blanks from here, so the way on is never lost. */
  it("will not hand in a paper with blanks on it", async () => {
    fetchAssessment.mockResolvedValue(ready());

    draw(PAPER);
    await screen.findByText("What does the compiler read?");
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));

    expect(screen.getByRole("button", { name: "Submit quiz" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  it("submits the answers once every question has one", async () => {
    fetchAssessment.mockResolvedValue(ready());
    submitAssessment.mockResolvedValue({
      result: { score: 2, total: 2, passMark: 1, passed: true, attempt: 1, items: [] }
    });

    draw(PAPER);
    await screen.findByText("What does the compiler read?");

    fireEvent.click(screen.getByRole("radio", { name: "Source" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("radio", { name: "True" }));

    const submit = screen.getByRole("button", { name: "Submit quiz" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(submitAssessment).toHaveBeenCalled());
    expect(submitAssessment.mock.calls[0][2]).toEqual([
      { itemId: "q1", choice: "c1" },
      { itemId: "q2", choice: "t" }
    ]);
  });

  /** A marked paper is being read, not answered: Next goes back to paging. */
  it("goes back to Next once the paper is marked", async () => {
    fetchAssessment.mockResolvedValue({
      ...ready(),
      result: { score: 2, total: 2, passMark: 1, passed: true, attempt: 1, items: [] }
    });

    draw(PAPER);
    await screen.findByText("What does the compiler read?");
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));

    expect(screen.queryByRole("button", { name: "Submit quiz" })).toBeNull();
    expect(screen.getByRole("button", { name: "Next question" })).toBeDisabled();
  });
});

/**
 * A tracing question is only a question if its code arrives the way it was
 * written. Folded into the question's paragraph it would be one line of Java,
 * and "what does line 3 print?" would point at nothing.
 */
describe("QuizRunner — a question about code", () => {
  const withCode = () => {
    const paper = ready();
    paper.assessment.items[0] = {
      ...paper.assessment.items[0],
      q: "What does this program print?",
      code: "int total = 0;\nfor (int i = 1; i <= 3; i++) {\n    total += i;\n}\nSystem.out.println(total);"
    };
    return paper;
  };

  it("shows the code between the question and the answers, one numbered line each", async () => {
    fetchAssessment.mockResolvedValue(withCode());

    const { container } = draw(PAPER);
    await screen.findByText("What does this program print?");

    const block = container.querySelector("pre.code-block");
    expect(block).not.toBeNull();
    expect(block.querySelectorAll(".code-block__line")).toHaveLength(5);
    // The indentation is the code's, and it survives.
    expect(block.textContent).toContain("    total += i;");
  });

  it("draws no code box for a question that has no code", async () => {
    fetchAssessment.mockResolvedValue(ready());

    const { container } = draw(PAPER);
    await screen.findByText("What does the compiler read?");

    expect(container.querySelector("pre.code-block")).toBeNull();
  });
});
