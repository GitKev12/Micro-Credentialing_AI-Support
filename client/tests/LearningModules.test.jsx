import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { act, render, screen, fireEvent } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

/**
 * The final exam's row, through the page that draws it.
 *
 * A locked final used to be a disabled button carrying its own reason, so
 * pressing it did nothing and the sentence had to fit on a rail-width line. It
 * opens now, like a lesson's quiz, and the viewer is where the reason is read.
 */

const COURSE = { id: "c1", code: "CC2", title: "Computer Programming 2" };

const FINAL = {
  id: "placeholder:final:c1",
  courseId: "c1",
  moduleId: null,
  scope: "final",
  title: "",
  itemCount: 0,
  totalPoints: 0,
  passMark: 0,
  placeholder: true,
  locked: true,
  // What the server sends for an unreleased final — see unreleasedReason().
  reason: "Your assessor will unlock this final exam.",
  result: null
};

let assessments = [FINAL];
let modules = [];
let completed = [];

/**
 * What the open lesson's reader is given.
 *
 * Worth being able to vary: jsdom lays nothing out, so every pane measures zero
 * high, and the page's own rule that a lesson short enough to need no scrolling
 * counts as read fires on the first lesson of every test. A lesson carrying an
 * unanswered exercise is the one shape that cannot complete itself.
 */
const EMPTY_LESSON = { blocks: [], sections: [], hasText: false, pages: [] };
const UNFINISHED_LESSON = {
  hasText: true,
  sections: [],
  pages: [],
  blocks: [
    { type: "exercise", questions: [{ id: "q1", prompt: "Which one?", choices: ["a", "b"] }] }
  ]
};
let lessonText = EMPTY_LESSON;

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  getStoredSession: () => ({ user: { id: "stu-1", displayName: "Ana Cruz" } })
}));

jest.unstable_mockModule("../src/services/learningModules.js", () => ({
  fetchCourseModules: async () => ({ course: COURSE, modules }),
  fetchCourseProgress: async () => completed,
  fetchModuleSections: async () => [],
  fetchModuleText: async () => lessonText,
  moduleFigureUrl: (moduleId, fileId) => `/api/modules/${moduleId}/figures/${fileId}`,
  moduleFileUrl: () => "",
  setModuleCompleted: async () => ({ completed: true })
}));

jest.unstable_mockModule("../src/services/assessments.js", () => ({
  fetchCourseAssessments: async () => assessments,
  fetchAssessment: jest.fn(),
  submitAssessment: jest.fn()
}));

let LearningModules, MemoryRouter, Routes, Route;
// The live standing store, written to here the way the watcher writes to it.
let reportCourseStanding, clearStanding;

beforeAll(async () => {
  ({ MemoryRouter, Routes, Route } = await import("react-router-dom"));
  ({ reportCourseStanding, clearStanding } = await import("../src/auth/services/standing.js"));
  ({ default: LearningModules } = await import("../src/pages/student/LearningModules.jsx"));
});

beforeEach(() => {
  assessments = [FINAL];
  modules = [];
  completed = [];
  lessonText = EMPTY_LESSON;
  window.localStorage.clear();
  // It outlives a test otherwise: it is one module-level store, and a course
  // closed in one test would open the next one closed.
  clearStanding();
});

const draw = async () => {
  const view = render(
    <MemoryRouter initialEntries={["/student/courses/c1/modules"]}>
      <Routes>
        <Route path="/student/courses/:courseId/modules" element={<LearningModules />} />
        {/* Where the back control goes. Never matched while the reader is up. */}
        <Route path="/student" element={<p>Course list</p>} />
      </Routes>
    </MemoryRouter>
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
};

const finalButton = (container) => container.querySelector(".sd-final__btn");

const press = async (element) => {
  fireEvent.click(element);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe("the final exam row", () => {
  it("can be pressed even while it is shut", async () => {
    const { container } = await draw();
    expect(finalButton(container)).not.toBeDisabled();
  });

  it("still reads as shut", async () => {
    const { container } = await draw();

    expect(finalButton(container)).toHaveClass("is-locked");
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("does not carry the reason itself", async () => {
    await draw();
    expect(screen.queryByText(FINAL.reason)).not.toBeInTheDocument();
  });

  /**
   * A paper nobody has written has no length and no pass mark, and the row used
   * to fall through to printing both of them as zero.
   */
  it("says nothing about a paper that has not been written", async () => {
    const { container } = await draw();

    expect(container.querySelector(".sd-final__state")).toBeNull();
    expect(screen.queryByText(/0 questions/)).not.toBeInTheDocument();
  });

  it("says what the paper is once there is one", async () => {
    assessments = [
      { ...FINAL, id: "f1", placeholder: false, title: "Final Exam", itemCount: 40, passMark: 24 }
    ];
    const { container } = await draw();

    expect(container.querySelector(".sd-final__state")).toHaveTextContent(
      "40 questions · pass 24"
    );
  });

  it("opens onto the reason when it is pressed", async () => {
    const { container } = await draw();

    await press(finalButton(container));

    expect(screen.getByText(FINAL.reason)).toBeInTheDocument();
    expect(container.querySelector(".sd-quiz__locked")).not.toBeNull();
  });

  /**
   * The panel offers the lesson behind a shut quiz. A final has no single
   * lesson behind it — its reason names whatever is still outstanding across
   * the course — so it must not offer one.
   */
  it("sends nobody to a lesson a final exam does not have", async () => {
    const { container } = await draw();

    await press(finalButton(container));

    expect(screen.queryByRole("button", { name: "Go to the lesson" })).toBeNull();
  });

  /** A placeholder carries no title, and the viewer's heading cannot be blank. */
  it("names it in the viewer even with no paper behind it", async () => {
    const { container } = await draw();

    await press(finalButton(container));

    expect(container.querySelector(".module-viewer__title")).toHaveTextContent(
      "Final Exam"
    );
  });
});

/**
 * The card at the head of the rail.
 *
 * It counts finished lessons, the same sum the server makes for the course
 * card on My Courses — the two must never disagree — and it now says the
 * figure as well as drawing it.
 */
describe("the course progress card", () => {
  const LESSONS = [
    { id: "m1", title: "Introduction to Java" },
    { id: "m2", title: "Control Structures" },
    { id: "m3", title: "Using Methods" },
    { id: "m4", title: "Arrays" }
  ];

  // Four lessons is a course worth nine: the four, a quiz for each, and one
  // final. See progressSummary in courses.controller.js.
  const ITEMS = 9;

  const quiz = (moduleId, passed) => ({
    id: `q-${moduleId}`,
    scope: "lesson",
    moduleId,
    title: `Quiz for ${moduleId}`,
    itemCount: 10,
    passMark: 6,
    locked: false,
    result: { passed, score: passed ? 8 : 3, total: 10 }
  });

  const card = (container) => container.querySelector(".modules-progress");
  const count = (container) =>
    card(container).querySelector(".modules-progress__count").textContent;
  const of = (container) => card(container).querySelector(".modules-progress__of").textContent;

  /** The whole point of the change: papers count, not only reading. */
  it("counts the quizzes as well as the lessons", async () => {
    modules = LESSONS;
    completed = ["m1", "m2"];
    assessments = [FINAL, quiz("m1", true), quiz("m2", false)];
    const { container } = await draw();

    // Two lessons read and one quiz passed, out of nine.
    expect(count(container)).toContain("33%");
    expect(of(container)).toContain(`3 of ${ITEMS}`);
  });

  it("draws the bar to the figure it just printed", async () => {
    modules = LESSONS;
    completed = ["m1", "m2", "m3"];
    assessments = [FINAL];
    const { container } = await draw();

    expect(count(container)).toContain("33%");
    expect(card(container).querySelector(".modules-progress__fill")).toHaveStyle({
      width: "33%"
    });
  });

  it("starts at nothing rather than at a blank", async () => {
    modules = LESSONS;
    // Nothing finished, and nothing that can finish itself on being opened.
    lessonText = UNFINISHED_LESSON;
    const { container } = await draw();

    expect(count(container)).toContain("0%");
    expect(of(container)).toContain(`0 of ${ITEMS}`);
  });

  /**
   * Reading every lesson used to be the whole of it, and read as finished with
   * every paper still to sit.
   */
  it("does not call a course finished on the reading alone", async () => {
    modules = LESSONS;
    completed = ["m1", "m2", "m3", "m4"];
    assessments = [FINAL];
    const { container } = await draw();

    expect(count(container)).toContain("44%");
    expect(of(container)).toContain(`4 of ${ITEMS}`);
  });

  it("reaches full only once the final has been passed too", async () => {
    modules = LESSONS;
    completed = ["m1", "m2", "m3", "m4"];
    const quizzes = LESSONS.map((lesson) => quiz(lesson.id, true));

    assessments = [{ ...FINAL, placeholder: false, locked: false }, ...quizzes];
    let view = await draw();
    // Everything but the final: eight of nine.
    expect(count(view.container)).toContain("89%");

    view.unmount();
    assessments = [
      { ...FINAL, placeholder: false, locked: false, result: { passed: true, score: 30, total: 40 } },
      ...quizzes
    ];
    view = await draw();
    expect(count(view.container)).toContain("100%");
    expect(of(view.container)).toContain(`${ITEMS} of ${ITEMS}`);
  });

  /**
   * Regenerating a lesson's paper leaves the old one on the rail beside the new
   * one. Both are that lesson's quiz, and a lesson only has one to pass.
   */
  it("counts one quiz per lesson however many papers it has", async () => {
    modules = LESSONS;
    completed = [];
    // Nothing that can finish itself on being opened, so the only thing in the
    // count is the quiz.
    lessonText = UNFINISHED_LESSON;
    assessments = [
      FINAL,
      { ...quiz("m1", true), id: "q-m1-old" },
      { ...quiz("m1", true), id: "q-m1-new" }
    ];
    const { container } = await draw();

    expect(of(container)).toContain(`1 of ${ITEMS}`);
  });

  /** No lessons yet is not 0% of nothing — the card has nothing to report. */
  it("is not drawn for a course with no lessons", async () => {
    const { container } = await draw();
    expect(card(container)).toBeNull();
  });
});

/**
 * The rail's shape.
 *
 * Two things sit outside the scrolling list on purpose: the progress card at
 * the head, so the count is never scrolled away, and the final exam at the
 * foot, so the thing the course is worked towards is not sixty-eight lessons
 * down a scroller.
 */
describe("the curriculum rail", () => {
  const LESSONS = [
    { id: "m1", title: "Introduction to Java" },
    { id: "m2", title: "Control Structures" }
  ];

  it("keeps the final exam out of the scrolling list", async () => {
    modules = LESSONS;
    const { container } = await draw();

    const scroller = container.querySelector(".modules-layout__scroll");
    expect(scroller.querySelector(".sd-final")).toBeNull();
    expect(container.querySelector(".modules-layout__aside > .sd-final")).not.toBeNull();
  });

  it("keeps the progress card out of it too", async () => {
    modules = LESSONS;
    const { container } = await draw();

    const scroller = container.querySelector(".modules-layout__scroll");
    expect(scroller.querySelector(".modules-progress")).toBeNull();
    expect(container.querySelector(".modules-layout__aside > .modules-progress")).not.toBeNull();
  });

  it("still scrolls the lessons themselves", async () => {
    modules = LESSONS;
    const { container } = await draw();

    const scroller = container.querySelector(".modules-layout__scroll");
    expect(scroller.querySelector(".sd-lesson-nav")).not.toBeNull();
  });
});

/**
 * The lesson viewer's head.
 *
 * It used to carry a link handing the student the module's raw PDF in a new
 * tab. The reader is the way into a lesson — it is what the sections jump
 * into, what the figures are pulled out for, and what decides the lesson is
 * finished. A second door to the same module that none of that follows
 * through was a way to leave the course rather than read it.
 */
describe("the lesson viewer's head", () => {
  beforeEach(() => {
    modules = [{ id: "m1", title: "Introduction to Java" }];
    lessonText = UNFINISHED_LESSON;
  });

  it("does not offer the raw file in a new tab", async () => {
    const { container } = await draw();

    expect(screen.queryByText("Open in new tab")).not.toBeInTheDocument();
    expect(container.querySelector(".module-viewer__head a")).toBeNull();
  });

  it("still names the lesson it is open on", async () => {
    const { container } = await draw();

    expect(container.querySelector(".module-viewer__title")).toHaveTextContent(
      "Introduction to Java"
    );
  });
});


/**
 * A figure's caption.
 *
 * The extractor leaves "Figure 3 …" as a paragraph of its own directly under
 * the picture. Drawn like every other paragraph it reads as the opening line
 * of the prose that follows, which is the one thing it is not.
 */
describe("a figure's caption", () => {
  const withBlocks = (blocks) => {
    modules = [{ id: "m1", title: "Looping" }];
    lessonText = { hasText: true, sections: [], pages: [], blocks };
  };

  it("is set apart from the prose around it", async () => {
    withBlocks([
      { type: "figure", fileId: "f1", page: 3, width: 400, height: 200 },
      { type: "paragraph", text: "Figure 3 Sequence of a while loop" }
    ]);

    const { container } = await draw();

    expect(container.querySelector(".lesson-reader__caption")).toHaveTextContent(
      "Figure 3 Sequence of a while loop"
    );
  });

  it("leaves a sentence that merely opens with the label as prose", async () => {
    withBlocks([
      {
        type: "paragraph",
        text:
          "Figure 3 shows the sequence a while loop follows, and the sections " +
          "below walk through each of its steps in the order they are taken."
      }
    ]);

    const { container } = await draw();

    expect(container.querySelector(".lesson-reader__caption")).toBeNull();
    expect(container.querySelector(".lesson-reader__p")).toBeInTheDocument();
  });
});


/**
 * The way out of the reader.
 *
 * The nav bar is hidden on this route, so this control is the only one, and it
 * is drawn as a bare chevron — its name lives on aria-label rather than in
 * anything on screen. That is exactly the arrangement that loses a name
 * silently, so the name is what these ask for.
 */
describe("the back control", () => {
  it("is named even though it shows no words", async () => {
    await draw();
    expect(screen.getByRole("button", { name: "Back to courses" })).toBeInTheDocument();
  });

  it("returns to the course list", async () => {
    await draw();
    await press(screen.getByRole("button", { name: "Back to courses" }));
    expect(screen.getByText("Course list")).toBeInTheDocument();
  });
});


/**
 * Closed while they were reading it.
 *
 * A suspension is written in another console, and the page a student is looking
 * at has no way of knowing. They used to carry on reading — and finishing
 * lessons, and handing papers in — until something made this page load again.
 * The watcher asks the server every few seconds and writes the answer into the
 * standing store; these are what the reader does with it.
 */
describe("a course closed under the student", () => {
  const ASSESSOR_CLOSED =
    "Your assessor has closed this course for you, so its lessons are shut for now.";

  const close = async (reason = ASSESSOR_CLOSED, by = "assessor") => {
    await act(async () => {
      reportCourseStanding([{ courseId: "c1", by, reason }]);
    });
  };

  it("shuts the page, with the reason, and without being reloaded", async () => {
    modules = [{ id: "m1", title: "Introduction to Java" }];
    const { container } = await draw();
    // Named twice while the page is open — once in the rail and once over the
    // viewer — which is the shape being checked has gone afterwards.
    expect(screen.getAllByText("Introduction to Java")).toHaveLength(2);

    await close();

    expect(screen.getByText(ASSESSOR_CLOSED)).toBeInTheDocument();
    // Not a banner over the lessons: there are no lessons to have one over.
    expect(container.querySelector(".modules-layout")).toBeNull();
  });

  /**
   * The two suspensions are undone by different people, so the student is sent
   * to the right one. The sentence is the server's either way — this only
   * checks the page shows whichever it was handed.
   */
  it("says the administrator's, when it was the class that was switched off", async () => {
    await draw();
    await close("Your class for this course is switched off, so its lessons are closed for now.", "class");

    expect(screen.getByText(/class for this course is switched off/)).toBeInTheDocument();
    expect(screen.queryByText(/assessor has closed/)).not.toBeInTheDocument();
  });

  /**
   * And back again. Closing needs no reload — the page has everything it needs
   * to say so — but opening does: the lessons, the quizzes and the progress
   * were all refused while it was shut, so the page is holding nothing.
   */
  it("reads the course again when it opens back up", async () => {
    const { container } = await draw();
    await close();

    modules = [{ id: "m1", title: "Introduction to Java" }];
    await act(async () => {
      reportCourseStanding([]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByText(ASSESSOR_CLOSED)).not.toBeInTheDocument();
    expect(container.querySelector(".modules-layout")).toBeInTheDocument();
    // The lessons are back, which they could only be by being asked for again:
    // the page had none of them while the course was shut.
    expect(screen.getAllByText("Introduction to Java").length).toBeGreaterThan(0);
  });

  /**
   * Silence is not an answer. Until the watcher has heard back there is nothing
   * newer than what the page loaded with, and an empty store must not be read
   * as "everything is open".
   */
  it("leaves a course that loaded shut shut, until the server says otherwise", async () => {
    await draw();
    expect(screen.queryByText(ASSESSOR_CLOSED)).not.toBeInTheDocument();
  });
});
