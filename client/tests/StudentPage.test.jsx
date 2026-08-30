import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const MODULES = [
  { moduleId: "m1", n: 1, title: "One", state: "done", score: 8, total: 10, submittedAt: null, submissionId: "s1", read: true },
  { moduleId: "m2", n: 2, title: "Two", state: "pending", score: null, total: 10, submittedAt: null, submissionId: "s2", read: true },
  { moduleId: "m3", n: 3, title: "Three", state: "locked", score: null, total: 10, submittedAt: null, submissionId: null, read: false }
];

let detail = {};

// Google Charts fetches its engine from gstatic at runtime and paints to a
// canvas, so there is nothing for jsdom to render or query. What is worth
// pinning is the other side of the boundary: the rows and options handed over.
const charts = [];

jest.unstable_mockModule("react-google-charts", () => ({
  Chart: (props) => {
    charts.push(props);
    return <div data-testid="gchart" />;
  }
}));

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

beforeEach(() => {
  charts.length = 0;
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
  waiting: null,
  badges: { earned: 1, total: 3, items: [] }
};

const draw = () =>
  render(
    <MemoryRouter initialEntries={["/assessor/classes/c1/students/st1"]}>
      <Routes>
        <Route path="/assessor/classes/:classId/students/:studentId" element={<StudentPage />} />
      </Routes>
    </MemoryRouter>
  );

/** Every plotted row, header dropped. */
const rows = () => charts[charts.length - 1].data.slice(1);

/** Label and score of every plotted bar. */
const plotted = () => rows().map((row) => [row[0], row[1]]);

/** The pass-mark series, which is the last cell of each row. */
const passMark = () => rows().map((row) => row[row.length - 1]);

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
    expect(plotted()).toEqual([
      ["1", 100],
      ["2", 100],
      ["3", 100]
    ]);
    // The pass mark is drawn even with nothing standing against it.
    expect(passMark()).toEqual([60, 60, 60]);
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
    draw();

    await screen.findByText("72%");

    // Bars carry the lesson number, so a bar and a table row point at the
    // same lesson.
    expect(plotted()).toEqual([
      ["1", 80],
      ["2", 40]
    ]);
    expect(passMark()).toEqual([60, 60]);

    // Every bar carries a resolved colour string. Which one it resolves to is
    // the theme's business and needs a real stylesheet, so it is not asserted
    // here — only that the row is filled in.
    expect(rows().every((row) => typeof row[2] === "string" && row[2].length > 0)).toBe(true);

    expect(
      screen.getByText("1 of 2 topics below 60% — weakest is Two at 40%.")
    ).toBeInTheDocument();
  });

  it("describes the plot for a screen reader, which cannot read the canvas", async () => {
    detail = { ...base, skillGap: null };
    const { container } = draw();

    await screen.findByText("Performance — final exam");

    const plot = container.querySelector(".hero-chart");
    expect(plot.getAttribute("role")).toBe("img");
    expect(plot.getAttribute("aria-label")).toContain("pass mark is 60 percent");
  });
});
