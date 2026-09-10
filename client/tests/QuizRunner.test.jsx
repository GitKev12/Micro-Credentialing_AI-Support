import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { fireEvent, render, screen } from "@testing-library/react";

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

jest.unstable_mockModule("../src/services/assessments.js", () => ({
  fetchAssessment,
  submitAssessment: jest.fn()
}));

let QuizRunner;

beforeAll(async () => {
  QuizRunner = (await import("../src/pages/student/components/QuizRunner.jsx")).default;
});

beforeEach(() => {
  fetchAssessment.mockReset();
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
