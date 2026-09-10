import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

/**
 * Three lessons in the three states the table draws: read and passed, read but
 * not yet quizzed, and never opened.
 */
const MODULES = [
  { moduleId: "m1", n: 1, title: "One", state: "done", read: true, readAt: "2026-09-01T00:00:00.000Z", passed: true },
  { moduleId: "m2", n: 2, title: "Two", state: "locked", read: true, readAt: "2026-09-03T00:00:00.000Z", passed: null },
  { moduleId: "m3", n: 3, title: "Three", state: "locked", read: false, readAt: null, passed: null }
];

let detail = {};

jest.unstable_mockModule("../src/services/assessors.js", () => ({
  storedAssessorId: () => "ASS001",
  fetchStudentDetail: async () => detail
}));
jest.unstable_mockModule("../src/services/achievements.js", () => ({
  certificateFileUrl: () => "#"
}));

let StudentPage, MemoryRouter, Routes, Route;

beforeAll(async () => {
  ({ MemoryRouter, Routes, Route } = await import("react-router-dom"));
  ({ default: StudentPage } = await import("../src/pages/assessor/StudentPage.jsx"));
});

const base = {
  student: {
    id: "st1",
    name: "Ana Cruz",
    sid: "2021-0001",
    email: "ana.cruz@tsu.edu.ph",
    suspended: false
  },
  course: { id: "c1", code: "IT 101", name: "Intro" },
  modules: MODULES,
  credentials: [],
  final: null,
  badges: { earned: 1, total: 3, items: [] }
};

const draw = () =>
  render(
    <MemoryRouter initialEntries={["/assessor/classes/c1/students/st1"]}>
      <Routes>
        <Route path="/assessor/classes/:courseId/students/:studentId" element={<StudentPage />} />
      </Routes>
    </MemoryRouter>
  );

/** Every column the plot drew, as [lesson number, height]. */
const plotted = (container) =>
  [...container.querySelectorAll(".skill-chart__col")].map((col) => [
    col.querySelector(".skill-chart__tick").textContent,
    col.querySelector(".skill-chart__bar").style.height
  ]);

describe("student hero", () => {
  it("identifies the student by number and address, as the admin console does", async () => {
    detail = { ...base, skillGap: null };
    draw();

    expect(await screen.findByText("2021-0001 · ana.cruz@tsu.edu.ph")).toBeInTheDocument();
  });

  it("falls back to the number alone on a record with no address", async () => {
    detail = { ...base, student: { ...base.student, email: null }, skillGap: null };
    draw();

    expect(await screen.findByText("2021-0001")).toBeInTheDocument();
  });

  /**
   * Two things and no more: who the student is, and how far through they are.
   * The figure stands at the far end of the band, and being the only one there
   * it is named — a bar reading "3 of 6" beside a name says nothing on its own.
   */
  it("stands the course progress at the far end of the band, named", async () => {
    detail = { ...base, skillGap: null, progress: { completedItems: 3, itemCount: 6, percent: 50 } };
    const { container } = draw();

    await screen.findByText("Course progress");

    const bar = container.querySelector(".student-hero__progress [role=progressbar]");
    expect(bar.getAttribute("aria-label")).toBe("3 of 6");
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
  });
});

describe("PerformanceChart", () => {
  it("plots an empty seat per lesson before the exam is taken", async () => {
    detail = { ...base, skillGap: null };
    const { container } = draw();

    await screen.findByText("Performance — final exam");

    // Full height so the plot shows its scale, in a neutral rather than a
    // score colour — one seat per lesson, numbered off the lesson.
    expect(plotted(container)).toEqual([
      ["1", "100%"],
      ["2", "100%"],
      ["3", "100%"]
    ]);
    expect(container.querySelectorAll(".skill-chart__bar--waiting")).toHaveLength(3);

    // The pass mark is drawn even with nothing standing against it.
    expect(container.querySelector(".skill-chart__target").style.bottom).toBe("60%");
    expect(screen.getByText("60% pass")).toBeInTheDocument();
    expect(screen.getByText("Not taken yet")).toBeInTheDocument();
    expect(container.querySelector(".skill-chart__score--waiting").textContent).toBe("—");
  });

  it("fills the same plot once it has been taken", async () => {
    detail = {
      ...base,
      skillGap: {
        performance: 72,
        released: true,
        threshold: 60,
        skills: [
          { moduleId: "m1", topic: "One", score: 80, correct: 8, total: 10 },
          { moduleId: "m2", topic: "Two", score: 40, correct: 4, total: 10 }
        ]
      }
    };
    const { container } = draw();

    await screen.findByText("72%");

    // Columns carry the lesson number, so a column and a table row point at
    // the same lesson.
    expect(plotted(container)).toEqual([
      ["1", "80%"],
      ["2", "40%"]
    ]);
    expect(container.querySelectorAll(".skill-chart__bar--waiting")).toHaveLength(0);

    // Weak below the mark, strong above — the band drives the colour, and it
    // has to reach the column element for the CSS to see it.
    const bands = [...container.querySelectorAll(".skill-chart__col")].map((col) =>
      col.getAttribute("data-band")
    );
    expect(bands).toEqual(["strong", "weak"]);

    expect(
      screen.getByText("1 of 2 topics below 60% — weakest is Two at 40%.")
    ).toBeInTheDocument();
  });

  /**
   * A card at the head of the coursework column, not half the hero. Sharing
   * the band with the name left a column per lesson a few pixels wide on a
   * long course, and put an exam result inside the block that identifies the
   * student.
   */
  it("stands as a card of its own, above the lessons it was drawn from", async () => {
    detail = { ...base, skillGap: null };
    const { container } = draw();

    await screen.findByText("Performance — final exam");

    expect(container.querySelector(".student-hero .skill-chart")).toBeNull();

    const cards = [...container.querySelectorAll(".student-split .assessor-card")];
    expect(cards[0].querySelector(".skill-chart")).not.toBeNull();
    expect(cards[1].querySelector("table")).not.toBeNull();
  });

  it("describes the plot for a screen reader, which cannot read the columns", async () => {
    detail = { ...base, skillGap: null };
    const { container } = draw();

    await screen.findByText("Performance — final exam");

    const plot = container.querySelector(".skill-chart");
    expect(plot.getAttribute("role")).toBe("img");
    expect(plot.getAttribute("aria-label")).toContain("pass mark is 60 percent");
  });
});

/** The cells of one row, in the order the header names them. */
const cellsOf = (container, selector) => [
  ...container.querySelector(selector).querySelectorAll("td")
];

/** A row's bar, as the pair it prints: what is done, and how far along. */
const barOf = (container, selector) => {
  const cell = cellsOf(container, selector)[0];
  return {
    label: [...cell.querySelectorAll(".progress__row span")].map((span) => span.textContent),
    width: cell.querySelector(".progress__fill").style.width
  };
};

/** The same date the screen writes, whatever locale the run is in. */
const readable = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const FINAL = {
  title: "Final Exam",
  state: "done",
  passed: true,
  attemptsUsed: 2,
  attemptsAllowed: 3,
  posted: true
};

describe("modules table", () => {
  beforeEach(() => {
    detail = { ...base };
  });

  it("carries a column for each thing it now answers", async () => {
    draw();
    await screen.findByText("One");

    const table = screen.getAllByRole("table")[0];
    const headers = [...table.querySelectorAll("thead th")].map((cell) => cell.textContent.trim());

    expect(headers).toEqual(["Lesson", "Progress", "Lesson read", "Quiz"]);
  });

  /**
   * A lesson is two of the items the course figure over the table counts —
   * reading it, and passing its quiz — so a row's bar is one row's worth of
   * that same sum. The two cannot disagree because they are the same
   * arithmetic, run once on the server and once per row here.
   */
  describe("progress", () => {
    it("counts a lesson read and passed as done", async () => {
      detail = { ...base, modules: [MODULES[0]] };

      const { container } = draw();
      await screen.findByText("One");

      expect(barOf(container, "tbody tr")).toEqual({ label: ["2 of 2", "100%"], width: "100%" });
    });

    it("counts a lesson read but not yet quizzed as half of it", async () => {
      detail = { ...base, modules: [MODULES[1]] };

      const { container } = draw();
      await screen.findByText("Two");

      expect(barOf(container, "tbody tr")).toEqual({ label: ["1 of 2", "50%"], width: "50%" });
    });

    it("counts a lesson nobody has opened as none of it", async () => {
      detail = { ...base, modules: [MODULES[2]] };

      const { container } = draw();
      await screen.findByText("Three");

      expect(barOf(container, "tbody tr")).toEqual({ label: ["0 of 2", "0%"], width: "0%" });
    });

    /**
     * Taking a quiz is not passing it, and only passing it completes the
     * lesson. A row half done and a chip saying the quiz was taken would
     * otherwise look like a bug in the bar.
     */
    it("gives a failed quiz no credit it did not earn", async () => {
      detail = { ...base, modules: [{ ...MODULES[0], state: "done", passed: false }] };

      const { container } = draw();
      await screen.findByText("One");

      expect(barOf(container, "tbody tr").label).toEqual(["1 of 2", "50%"]);
      expect(screen.getByText("Not passed")).toBeInTheDocument();
    });
  });

  describe("lesson read", () => {
    it("writes the day the lesson was finished", async () => {
      detail = { ...base, modules: [MODULES[0]] };

      const { container } = draw();
      await screen.findByText("One");

      expect(cellsOf(container, "tbody tr")[1].textContent).toBe(readable(MODULES[0].readAt));
    });

    /**
     * Nothing records the moment a lesson is opened — how far into one a
     * reader has got stays in their own browser — so a lesson never finished
     * has no day to write, and the row says so rather than guessing at one.
     */
    it("dashes a lesson that was never finished", async () => {
      detail = { ...base, modules: [MODULES[2]] };

      const { container } = draw();
      await screen.findByText("Three");

      const cell = cellsOf(container, "tbody tr")[1];
      expect(cell.textContent).toBe("—");
      expect(cell.querySelector(".assessor-table__dash")).not.toBeNull();
    });
  });

  describe("quiz", () => {
    it("says what became of every quiz, in three states", async () => {
      detail = {
        ...base,
        modules: [MODULES[0], { ...MODULES[0], moduleId: "m9", n: 9, title: "Nine", passed: false }, MODULES[2]]
      };

      const { container } = draw();
      await screen.findByText("One");

      const chips = [...container.querySelectorAll("tbody .chip")].map((chip) => chip.textContent);
      expect(chips).toEqual(["Passed", "Not passed", "Not taken"]);
    });

    /** What it scored is the register's to say, and is said there. */
    it("carries no mark, no clock and no count of the goes", async () => {
      detail = { ...base, modules: [{ ...MODULES[0], score: 8, total: 10, attemptsUsed: 3 }] };

      const { container } = draw();
      await screen.findByText("One");

      const row = container.querySelector("tbody tr").textContent;
      expect(row).not.toContain("8/10");
      expect(row).not.toContain("3");
    });
  });

  /**
   * The register is the one way into a marked paper now. Two doors onto the
   * same read is what put four of its columns on this table in the first
   * place.
   */
  it("no longer opens a paper of its own", async () => {
    draw();
    await screen.findByText("One");

    expect(screen.queryByRole("button", { name: /Open the paper/ })).not.toBeInTheDocument();
  });

  describe("the final", () => {
    it("sits below the lessons, with no lesson number", async () => {
      detail = { ...base, final: FINAL };

      const { container } = draw();
      await screen.findByText("Final Exam");

      const row = container.querySelector("tfoot .module-row--final");
      expect(row).not.toBeNull();
      expect(row.querySelector(".module-row__num--none").textContent).toBe("");
    });

    /**
     * The final is one item of the course rather than a lesson's two: there is
     * nothing to read, only a paper to pass.
     */
    it("counts as one item, and has no lesson to have read", async () => {
      detail = { ...base, final: FINAL };

      const { container } = draw();
      await screen.findByText("Final Exam");

      const selector = "tfoot .module-row--final";
      expect(barOf(container, selector)).toEqual({ label: ["1 of 1", "100%"], width: "100%" });
      expect(cellsOf(container, selector)[1].textContent).toBe("—");
    });

    it("stands at nothing until it is passed", async () => {
      detail = { ...base, final: { ...FINAL, state: "locked", passed: null } };

      const { container } = draw();
      await screen.findByText("Final Exam");

      expect(barOf(container, "tfoot .module-row--final").label).toEqual(["0 of 1", "0%"]);
      // The lessons carry chips of their own, so this asks the final's row.
      expect(container.querySelector("tfoot .chip").textContent).toBe("Not taken");
    });

    /** The one paper with a ceiling on how often it may be taken. */
    it("says how many goes are left, and when there are none", async () => {
      detail = { ...base, final: FINAL };
      draw();
      expect(await screen.findByText("1 attempt left")).toBeInTheDocument();
    });

    it("says a final nobody posted is not posted, rather than not taken", async () => {
      // Not posting it is the assessor's own doing, and the row should not read
      // as if the student had failed to turn up.
      detail = {
        ...base,
        final: { ...FINAL, state: "locked", passed: null, attemptsUsed: 0, posted: false }
      };

      draw();
      expect(await screen.findByText("Not posted yet")).toBeInTheDocument();
    });
  });
});
