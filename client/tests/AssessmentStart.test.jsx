import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

/**
 * Starting a paper, and the clock that starts with it.
 *
 * Asking the server for the questions is what registers the sitting and starts
 * the clock, so a screen that described the paper by loading it would have
 * started the examination in order to ask whether to start it. Everything on
 * the brief therefore comes off the rail row, and nothing is fetched until
 * Start is pressed.
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
  window.localStorage.clear();
});

const paint = (assessment) =>
  render(
    <QuizRunner
      studentId="stu-1"
      assessment={assessment}
      onSubmitted={() => {}}
      onBadgeEarned={() => {}}
      onOpenLesson={null}
    />
  );

/** Draw the paper and turn it over. */
const open = (assessment) => {
  const view = paint(assessment);
  const start = screen.queryByRole("button", { name: /^Start/ });
  if (start) fireEvent.click(start);
  return view;
};

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

const PAPER = { id: "a2", scope: "lesson", title: "Java Basics" };

/** A first attempt, handed in and not passed, with two goes still on it. */
const TAKEN = {
  score: 1,
  total: 2,
  passMark: 2,
  passed: false,
  attempt: 1,
  attemptsUsed: 1,
  attemptsAllowed: 3,
  attemptsLeft: 2,
  canRetake: true,
  items: []
};

const TIMED = {
  id: "f1",
  scope: "final",
  title: "CC2 Final Exam",
  description: "Covers every lesson in the course.",
  itemCount: 60,
  passMark: 36,
  totalPoints: 60,
  timeLimitMinutes: 90
};

describe("before the paper is turned over", () => {
  it("asks nothing of the server until Start is pressed", async () => {
    paint(TIMED);

    expect(await screen.findByText("CC2 Final Exam")).toBeInTheDocument();
    expect(fetchAssessment).not.toHaveBeenCalled();
  });

  it("fetches the paper on Start, and only then", async () => {
    fetchAssessment.mockResolvedValue(ready());
    paint(TIMED);

    fireEvent.click(screen.getByRole("button", { name: /^Start/ }));

    await waitFor(() => expect(fetchAssessment).toHaveBeenCalledTimes(1));
  });

  it("states the terms of the paper off the rail row", async () => {
    paint(TIMED);

    expect(await screen.findByText("Questions")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("Pass mark")).toBeInTheDocument();
    expect(screen.getByText("36 of 60")).toBeInTheDocument();
  });

  it("sets the length out as the one figure that changes how you work", async () => {
    const { container } = paint(TIMED);

    expect(await screen.findByText("1 hour 30 minutes")).toBeInTheDocument();
    expect(container.querySelector(".sd-brief__clock")).not.toBeNull();
  });

  it("says what pressing Start does", async () => {
    paint(TIMED);

    expect(await screen.findByText(/clock starts when you press Start/i)).toBeInTheDocument();
    expect(screen.getByText(/hands itself in/i)).toBeInTheDocument();
  });

  it("names the paper in the button rather than saying Start", async () => {
    paint(TIMED);

    expect(
      await screen.findByRole("button", { name: /Start the final exam/i })
    ).toBeInTheDocument();
  });

  /** Reopening a marked paper is reading it, not starting it. */
  it("opens a paper already handed in to its mark", async () => {
    fetchAssessment.mockResolvedValue({ ...ready(), result: TAKEN });

    paint({ ...TIMED, result: TAKEN });

    expect(await screen.findByRole("button", { name: "Retake" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Start/ })).toBeNull();
  });

  /** An absence does not need a label reading "Untimed". */
  it("has no clock block at all on an untimed paper", async () => {
    const { container } = paint({ ...TIMED, timeLimitMinutes: null });

    await screen.findByText("Questions");
    expect(container.querySelector(".sd-brief__clock")).toBeNull();
    expect(screen.queryByText(/clock starts/i)).toBeNull();
  });

  /** A paper nobody can open has nothing to brief. */
  it("shows the lock rather than a brief for a shut paper", async () => {
    fetchAssessment.mockResolvedValue({ locked: true, message: "Finish this lesson first." });

    paint({ id: "a9", scope: "lesson", title: "Java Basics", locked: true });

    expect(await screen.findByText("Finish this lesson first.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Start/ })).toBeNull();
  });
});

/**
 * Going again.
 *
 * A retake used to start itself: the button fetched the paper, and fetching is
 * what registers the attempt and starts the clock — so a student pressing
 * Retake to see what they were in for was already a minute into their last go.
 */
describe("going again", () => {
  const reopen = async () => {
    fetchAssessment.mockResolvedValue({ ...ready(), result: TAKEN });
    paint({ ...TIMED, result: TAKEN });
    fireEvent.click(await screen.findByRole("button", { name: "Retake" }));
  };

  it("turns the paper face down again rather than dealing it", async () => {
    await reopen();

    expect(await screen.findByText(/clock starts when you press Start/i)).toBeInTheDocument();
    expect(fetchAssessment).toHaveBeenCalledTimes(1);
  });

  it("counts the sitting it is about to be", async () => {
    await reopen();

    expect(
      await screen.findByRole("button", { name: /Start attempt 2 of 3/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Attempts left")).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("asks for the fresh paper only once Start is pressed", async () => {
    await reopen();
    fetchAssessment.mockResolvedValue(ready());

    fireEvent.click(await screen.findByRole("button", { name: /^Start attempt/ }));

    await waitFor(() => expect(fetchAssessment).toHaveBeenCalledTimes(2));
    expect(fetchAssessment.mock.calls[1][2]).toEqual({ retake: true });
  });

  it("leaves the old mark behind when the new paper arrives", async () => {
    await reopen();
    fetchAssessment.mockResolvedValue(ready());

    fireEvent.click(await screen.findByRole("button", { name: /^Start attempt/ }));

    expect(await screen.findByText("What does the compiler read?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retake" })).toBeNull();
  });
});

/**
 * The clock, once it is running.
 *
 * Counted against the server's deadline rather than by subtracting a second a
 * second, so a backgrounded tab does not buy time — and read off the wall
 * clock each tick, so one reopened after an hour shows what it should.
 */
describe("the countdown", () => {
  const TIMED_PAPER = { id: "a2", scope: "lesson", title: "Java Basics", timeLimitMinutes: 30 };

  const readyAt = (msFromNow) => ({
    ...ready(),
    clock: {
      startedAt: new Date(Date.now() - (30 * 60000 - msFromNow)).toISOString(),
      endsAt: new Date(Date.now() + msFromNow).toISOString(),
      limitMinutes: 30
    }
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

  it("shows what is left, in the strip of facts about this paper", async () => {
    fetchAssessment.mockResolvedValue(readyAt(29 * 60000 + 4000));

    open(TIMED_PAPER);

    const clock = await screen.findByRole("timer");
    expect(clock.closest(".sd-quiz__meta")).not.toBeNull();
    expect(clock.textContent).toMatch(/29:0\d/);
  });

  it("marks the last five minutes", async () => {
    fetchAssessment.mockResolvedValue(readyAt(4 * 60000));

    open(TIMED_PAPER);

    expect((await screen.findByRole("timer")).className).toContain("is-low");
  });

  it("does not mark a paper with time still on it", async () => {
    fetchAssessment.mockResolvedValue(readyAt(20 * 60000));

    open(TIMED_PAPER);

    expect((await screen.findByRole("timer")).className).not.toContain("is-low");
  });

  it("shows no clock on an untimed paper", async () => {
    fetchAssessment.mockResolvedValue(ready());

    const { container } = open(PAPER);
    await screen.findByText("What does the compiler read?");

    expect(container.querySelector(".sd-clock")).toBeNull();
  });

  /**
   * The one case where an unfinished paper goes in: the sitting is over, so
   * what is on the paper is what was done in the time.
   */
  it("hands the paper in by itself when the time is gone", async () => {
    fetchAssessment.mockResolvedValue(readyAt(-1000));
    submitAssessment.mockResolvedValue({
      result: { score: 0, total: 2, passed: false, items: [] }
    });

    open(TIMED_PAPER);

    await waitFor(() => expect(submitAssessment).toHaveBeenCalledTimes(1));
  });

  it("sends the blanks as blanks rather than dropping them", async () => {
    fetchAssessment.mockResolvedValue(readyAt(-1000));
    submitAssessment.mockResolvedValue({
      result: { score: 0, total: 2, passed: false, items: [] }
    });

    open(TIMED_PAPER);

    await waitFor(() => expect(submitAssessment).toHaveBeenCalled());
    const payload = submitAssessment.mock.calls[0][2];
    expect(payload).toEqual([
      { itemId: "q1", choice: "" },
      { itemId: "q2", choice: "" }
    ]);
  });

  it("hands in once, however many ticks land on nought", async () => {
    fetchAssessment.mockResolvedValue(readyAt(-5000));
    submitAssessment.mockResolvedValue({
      result: { score: 0, total: 2, passed: false, items: [] }
    });

    open(TIMED_PAPER);

    await waitFor(() => expect(submitAssessment).toHaveBeenCalled());
    await settle();
    expect(submitAssessment).toHaveBeenCalledTimes(1);
  });

  it("leaves an untimed paper alone", async () => {
    fetchAssessment.mockResolvedValue(ready());

    open(PAPER);
    await screen.findByText("What does the compiler read?");
    await settle();

    expect(submitAssessment).not.toHaveBeenCalled();
  });
});
