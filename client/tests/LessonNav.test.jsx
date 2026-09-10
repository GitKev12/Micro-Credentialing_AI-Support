import { describe, it, expect, jest } from "@jest/globals";
import { render, screen, fireEvent, within } from "@testing-library/react";
import LessonNav from "../src/pages/student/components/LessonNav.jsx";

/**
 * What the curriculum rail says about how far a lesson has been read.
 *
 * The rail could previously only say finished or not, which is the one thing a
 * student part-way through a chapter already knows. These pin the other half:
 * the figure on the lesson, the figure on each of its sections, and the three
 * states a section node has to be able to show — untouched, part-read, done.
 */

const MODULES = [
  { id: "m1", title: "Introduction to Java" },
  { id: "m2", title: "Control Structures" }
];

const SECTIONS = {
  m1: [
    { id: "s1", title: "What Java is", page: 1, start: 0, end: 4 },
    { id: "s2", title: "Compiling and running", page: 2, start: 4, end: 9 },
    { id: "s3", title: "Your first program", page: 3, start: 9, end: 14 }
  ]
};

const READ = {
  m1: { percent: 45, sections: { s1: 100, s2: 30, s3: 0 } },
  m2: { percent: 0, sections: {} }
};

const draw = (overrides = {}) => {
  const props = {
    modules: MODULES,
    isCompleted: () => false,
    selectedLessonId: "m1",
    selectedAssessmentId: null,
    activeSection: null,
    expandedId: "m1",
    sectionsByModule: SECTIONS,
    sectionsLoadingId: null,
    assessmentsByModule: {},
    lessonProgressFor: (moduleId) => READ[moduleId]?.percent ?? 0,
    sectionProgressFor: (moduleId, sectionId) => READ[moduleId]?.sections?.[sectionId] ?? 0,
    onSelectLesson: () => {},
    onToggleSections: () => {},
    onOpenSection: () => {},
    onOpenAssessment: () => {},
    ...overrides
  };

  return render(<LessonNav {...props} />);
};

/** The <li> for one lesson, which is what carries its row and its panel. */
const lessonRow = (title) => screen.getByText(title).closest(".sd-lesson");

/** The <li> for one section, which is what carries its state. */
const sectionRow = (title) => screen.getByText(title).closest(".sd-sections__item");

describe("LessonNav — how far a lesson has been read", () => {
  it("puts the figure on the lesson row beside where you are in it", () => {
    draw();

    const row = lessonRow("Introduction to Java");
    expect(within(row).getByText("Reading now")).toBeInTheDocument();
    expect(within(row).getByText("45%")).toBeInTheDocument();
  });

  /**
   * The figure is drawn by the bullet itself — a ring round the lesson's
   * number, filling green as it is read. All the markup hands the stylesheet
   * is how far round to go.
   */
  it("winds the bullet's ring to the same figure", () => {
    draw();

    const marker = lessonRow("Introduction to Java").querySelector(".sd-lesson__marker");
    expect(marker.style.getPropertyValue("--read")).toBe("45");
  });

  it("has no second copy of the figure under the title", () => {
    const { container } = draw();
    expect(container.querySelector(".sd-lesson__bar")).toBeNull();
  });

  /**
   * The tick is the server's record and the percentage is the browser's. A
   * lesson finished on another machine has nothing stored here, so the record
   * has to be what answers — otherwise the row sits ticked and showing nothing
   * read, contradicting itself.
   */
  it("reads a finished lesson as full however little this browser saw", () => {
    draw({
      isCompleted: (moduleId) => String(moduleId) === "m2",
      lessonProgressFor: (moduleId) => (String(moduleId) === "m2" ? 100 : 45)
    });

    const row = lessonRow("Control Structures");
    expect(within(row).getByText("Completed")).toBeInTheDocument();
    expect(within(row).getByText("100%")).toBeInTheDocument();
    const marker = row.querySelector(".sd-lesson__marker");
    expect(marker.style.getPropertyValue("--read")).toBe("100");
    // Finished fills the middle in too, so a full ring and a finished lesson
    // are not the same picture.
    expect(marker).toHaveAttribute("data-state", "done");
  });

  /**
   * Read to the end, quiz still to pass. The row used to call this "Completed"
   * beside a half-filled ring, which is the row disagreeing with itself.
   */
  it("does not call a lesson completed while its quiz is outstanding", () => {
    draw({
      isCompleted: (moduleId) => String(moduleId) === "m2",
      lessonProgressFor: (moduleId) => (String(moduleId) === "m2" ? 50 : 45)
    });

    const row = lessonRow("Control Structures");
    expect(within(row).getByText("In progress")).toBeInTheDocument();
    expect(within(row).queryByText("Completed")).not.toBeInTheDocument();
    expect(within(row).getByText("50%")).toBeInTheDocument();
    expect(row.querySelector(".sd-lesson__marker")).not.toHaveAttribute("data-state", "done");
  });

  it("says nothing has been read of a lesson never opened", () => {
    draw({ selectedLessonId: "m1" });

    const row = lessonRow("Control Structures");
    expect(within(row).getByText("Not started")).toBeInTheDocument();
    expect(within(row).getByText("0%")).toBeInTheDocument();
  });
});

describe("LessonNav — sections", () => {
  it("gives every section of the open lesson its own figure", () => {
    draw();

    expect(within(sectionRow("What Java is")).getByText("100%")).toBeInTheDocument();
    expect(within(sectionRow("Compiling and running")).getByText("30%")).toBeInTheDocument();
    expect(within(sectionRow("Your first program")).getByText("0%")).toBeInTheDocument();
  });

  /**
   * The part-read state is the whole reason this list is opened: it is where
   * the student stopped. A node that is only ever hollow or filled cannot
   * point at it.
   */
  it("marks each section untouched, part-read or done", () => {
    draw();

    expect(sectionRow("What Java is")).toHaveAttribute("data-state", "done");
    expect(sectionRow("Compiling and running")).toHaveAttribute("data-state", "part");
    expect(sectionRow("Your first program")).toHaveAttribute("data-state", "todo");
  });

  it("winds each section's own bullet to its own figure", () => {
    draw();

    const node = (title) => sectionRow(title).querySelector(".sd-sections__node");
    expect(node("What Java is").style.getPropertyValue("--read")).toBe("100");
    expect(node("Compiling and running").style.getPropertyValue("--read")).toBe("30");
    expect(node("Your first program").style.getPropertyValue("--read")).toBe("0");
  });

  it("still opens the section when it is clicked", () => {
    const onOpenSection = jest.fn();
    draw({ onOpenSection });

    fireEvent.click(screen.getByText("Compiling and running"));

    expect(onOpenSection).toHaveBeenCalledTimes(1);
    const [module, section] = onOpenSection.mock.calls[0];
    expect(module.id).toBe("m1");
    expect(section.id).toBe("s2");
  });

  it("lights the section the reader was jumped to", () => {
    draw({ activeSection: { moduleId: "m1", sectionId: "s2" } });

    expect(sectionRow("Compiling and running")).toHaveClass("is-here");
    expect(sectionRow("What Java is")).not.toHaveClass("is-here");
  });

  it("says so when a lesson has no sections to show", () => {
    draw({ sectionsByModule: { m1: [] } });

    expect(screen.getByText("No sections detected in this module.")).toBeInTheDocument();
  });

  it("draws nothing but placeholders while they are still being fetched", () => {
    const { container } = draw({ sectionsByModule: {}, sectionsLoadingId: "m1" });

    expect(container.querySelectorAll(".sd-sections__skeleton")).toHaveLength(3);
  });
});

/**
 * A quiz nobody has posted yet.
 *
 * The row used to be a disabled button, so pressing it did nothing at all and
 * the only way to find out why was a tooltip. It opens now — there is still
 * nothing to sit, and the viewer is where that gets said.
 */
describe("LessonNav — a locked quiz", () => {
  const LOCKED = {
    id: "placeholder:lesson:m1",
    moduleId: "m1",
    scope: "lesson",
    title: "",
    placeholder: true,
    locked: true,
    reason: "Your assessor will unlock this quiz.",
    result: null
  };

  const withQuiz = (quiz = LOCKED, overrides = {}) =>
    draw({ assessmentsByModule: { m1: [quiz] }, ...overrides });

  const quizRow = () => screen.getByText("Quiz 1").closest("button");

  it("can still be pressed", () => {
    withQuiz();
    expect(quizRow()).not.toBeDisabled();
  });

  it("opens when it is pressed", () => {
    const onOpenAssessment = jest.fn();
    withQuiz(LOCKED, { onOpenAssessment });

    fireEvent.click(quizRow());

    expect(onOpenAssessment).toHaveBeenCalledWith(LOCKED);
  });

  /**
   * Being openable must not make it look posted — the row is the only thing
   * saying the paper is shut until the viewer has been opened on it.
   */
  it("still reads as shut", () => {
    withQuiz();

    expect(quizRow()).toHaveClass("is-locked");
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  /** The reason belongs to the viewer, which has the room to give it. */
  it("does not carry the reason itself", () => {
    withQuiz();

    expect(screen.queryByText("Your assessor will unlock this quiz.")).not.toBeInTheDocument();
    expect(quizRow()).not.toHaveAttribute("title");
  });

  it("leaves a posted quiz alone", () => {
    const posted = {
      id: "a1",
      moduleId: "m1",
      scope: "lesson",
      title: "Java Basics",
      locked: false,
      result: null
    };
    withQuiz(posted, { isCompleted: () => true });

    expect(quizRow()).not.toBeDisabled();
    expect(quizRow()).not.toHaveClass("is-locked");
    expect(screen.queryByText("Locked")).not.toBeInTheDocument();
  });
});
