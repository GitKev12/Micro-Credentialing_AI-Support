import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const MODULES = [
  { moduleId: "m1", n: 1, title: "One", state: "done", score: 8, total: 10, submittedAt: null, submissionId: "s1", read: true, attemptsUsed: 1 },
  { moduleId: "m2", n: 2, title: "Two", state: "pending", score: null, total: 10, submittedAt: null, submissionId: "s2", read: true, attemptsUsed: 0 },
  { moduleId: "m3", n: 3, title: "Three", state: "locked", score: null, total: 10, submittedAt: null, submissionId: null, read: false, attemptsUsed: 0 }
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
  [...container.querySelectorAll(".hero-chart__col")].map((col) => [
    col.querySelector(".hero-chart__tick").textContent,
    col.querySelector(".hero-chart__bar").style.height
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
    expect(container.querySelectorAll(".hero-chart__bar--waiting")).toHaveLength(3);

    // The pass mark is drawn even with nothing standing against it.
    expect(container.querySelector(".hero-chart__target").style.bottom).toBe("60%");
    expect(screen.getByText("60% pass")).toBeInTheDocument();
    expect(screen.getByText("Not taken yet")).toBeInTheDocument();
    expect(container.querySelector(".hero-chart__score--waiting").textContent).toBe("—");
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
    expect(container.querySelectorAll(".hero-chart__bar--waiting")).toHaveLength(0);

    // Weak below the mark, strong above — the band drives the colour, and it
    // has to reach the column element for the CSS to see it.
    const bands = [...container.querySelectorAll(".hero-chart__col")].map((col) =>
      col.getAttribute("data-band")
    );
    expect(bands).toEqual(["strong", "weak"]);

    expect(
      screen.getByText("1 of 2 topics below 60% — weakest is Two at 40%.")
    ).toBeInTheDocument();
  });

  it("describes the plot for a screen reader, which cannot read the columns", async () => {
    detail = { ...base, skillGap: null };
    const { container } = draw();

    await screen.findByText("Performance — final exam");

    const plot = container.querySelector(".hero-chart");
    expect(plot.getAttribute("role")).toBe("img");
    expect(plot.getAttribute("aria-label")).toContain("pass mark is 60 percent");
  });
});

describe("modules table", () => {
  beforeEach(() => {
    detail = { ...base };
  });

  it("writes how long an attempt ran, in hours and minutes", async () => {
    detail = {
      ...base,
      modules: [{ ...MODULES[0], durationMs: 75 * 60 * 1000, timeLimitMinutes: null }]
    };

    draw();
    expect(await screen.findByText("1h 15m")).toBeInTheDocument();
  });

  it("names the clock a timed paper ran against", async () => {
    // A limit is the assessor's to set and most papers have none, so it appears
    // only where one was given.
    detail = {
      ...base,
      modules: [{ ...MODULES[0], durationMs: 20 * 60 * 1000, timeLimitMinutes: 60 }]
    };

    draw();
    expect(await screen.findByText("20m")).toBeInTheDocument();
    expect(screen.getByText("of 1h allowed")).toBeInTheDocument();
  });

  it("leaves an untimed attempt blank rather than at zero", async () => {
    // Every paper handed in before duration was recorded has none, and "0m"
    // would read as a very fast attempt rather than as no answer.
    detail = { ...base, modules: [{ ...MODULES[0], durationMs: null }] };

    const { container } = draw();
    await screen.findByText("One");
    expect(container.querySelectorAll(".assessor-table__dash").length).toBeGreaterThan(0);
  });

  it("sets the final below the lessons, with no lesson number", async () => {
    detail = {
      ...base,
      final: {
        assessmentId: "f1",
        title: "Final Exam",
        state: "done",
        score: 42,
        total: 60,
        durationMs: 55 * 60 * 1000,
        timeLimitMinutes: 60,
        submissionId: "sf",
        submittedAt: "2026-09-01T00:00:00.000Z",
        attempt: 2,
        attemptsUsed: 2,
        attemptsAllowed: 3,
        posted: true
      }
    };

    const { container } = draw();

    const row = await screen.findByText("Final Exam");
    expect(row).toBeInTheDocument();
    // The Retakes column carries how many have gone, so the subtitle carries
    // what is left instead of saying the same thing twice.
    expect(screen.getByText("1 attempt left")).toBeInTheDocument();
    expect(screen.getByText("42/60")).toBeInTheDocument();

    // Its own row under the numbered list, and the number slot is empty.
    const finalRow = container.querySelector(".module-row--final");
    expect(finalRow).not.toBeNull();
    expect(finalRow.querySelector(".module-row__num--none").textContent).toBe("");
    expect(container.querySelector("tfoot .module-row--final")).not.toBeNull();
  });

  it("says a final nobody posted is not posted, rather than not taken", async () => {
    // Not posting it is the assessor's own doing, and the row should not read
    // as if the student had failed to turn up.
    detail = {
      ...base,
      final: {
        assessmentId: null,
        title: "Final Exam",
        state: "locked",
        score: null,
        total: null,
        durationMs: null,
        timeLimitMinutes: null,
        submissionId: null,
        submittedAt: null,
        attempt: 0,
        attemptsAllowed: 3,
        posted: false
      }
    };

    draw();
    expect(await screen.findByText("Not posted yet")).toBeInTheDocument();
  });
});

/**
 * The Retakes column is the last on the row, so it is read from the end rather
 * than by counting the ones before it — a column added in the middle later
 * should not silently move what these assert on.
 */
const retakesCell = (container, selector) =>
  [...container.querySelector(selector).querySelectorAll("td")].at(-1);

const firstLesson = (container) => retakesCell(container, "tbody tr");

describe("retakes column", () => {
  it("counts the goes after the first, not the goes", async () => {
    // Three attempts is two retakes. The header asks for retakes, so the
    // column answers that question and not the neighbouring one.
    detail = { ...base, modules: [{ ...MODULES[0], attemptsUsed: 3 }] };

    const { container } = draw();
    await screen.findByText("One");

    expect(screen.getByRole("columnheader", { name: "Retakes" })).toBeInTheDocument();
    expect(firstLesson(container).textContent).toBe("2");
  });

  it("writes nought for a paper taken once, and keeps it quiet", async () => {
    detail = { ...base, modules: [{ ...MODULES[0], attemptsUsed: 1 }] };

    const { container } = draw();
    await screen.findByText("One");

    const cell = firstLesson(container);
    expect(cell.textContent).toBe("0");
    // Getting it right first time is the ordinary case; a bold zero on every
    // row would bury the ones worth looking at.
    expect(cell.querySelector(".assessor-table__zero")).not.toBeNull();
  });

  it("dashes a quiz nobody has taken, which is not the same as taking it once", async () => {
    detail = { ...base, modules: [{ ...MODULES[2], attemptsUsed: 0 }] };

    const { container } = draw();
    await screen.findByText("Three");

    const cell = firstLesson(container);
    expect(cell.textContent).toBe("—");
    expect(cell.querySelector(".assessor-table__dash")).not.toBeNull();
  });

  it("dashes a row from a server that does not send the count yet", async () => {
    // Inferring nought from "it was taken" would print a number nobody
    // measured. An absent count is absent.
    const { attemptsUsed, ...noCount } = MODULES[0];
    detail = { ...base, modules: [noCount] };

    const { container } = draw();
    await screen.findByText("One");
    expect(firstLesson(container).textContent).toBe("—");
  });

  it("counts the final's retakes on the same footing as a lesson's", async () => {
    detail = {
      ...base,
      final: {
        assessmentId: "f1",
        title: "Final Exam",
        state: "done",
        score: 42,
        total: 60,
        durationMs: null,
        timeLimitMinutes: null,
        submissionId: "sf",
        submittedAt: "2026-09-01T00:00:00.000Z",
        attempt: 3,
        attemptsUsed: 3,
        attemptsAllowed: 3,
        posted: true
      }
    };

    const { container } = draw();
    await screen.findByText("Final Exam");

    expect(retakesCell(container, "tfoot .module-row--final").textContent).toBe("2");
    // The one paper with a ceiling says when it has been reached.
    expect(screen.getByText("No attempts left")).toBeInTheDocument();
  });
});
