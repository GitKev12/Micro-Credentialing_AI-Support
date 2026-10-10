import { describe, it, expect, jest, beforeAll, beforeEach, afterEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { act, render, screen } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

/**
 * Opening a lesson whose text is still being prepared on the server.
 *
 * The server answers with a status instead of making the student wait for
 * OCR; the reader shows "Preparing lesson…" and asks again until it is ready.
 */

const COURSE = { id: "c1", code: "CC2", title: "Computer Programming 2" };
const LESSON = { id: "m1", title: "Creating Java Programs" };

const READY = {
  status: "ready",
  hasText: true,
  pages: [],
  sections: [],
  blocks: [{ type: "heading", level: 2, text: "Writing your first program" }]
};

const fetchModuleText = jest.fn();

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  getStoredSession: () => ({ user: { id: "stu-1", displayName: "Ana Cruz" } })
}));

jest.unstable_mockModule("../src/services/learningModules.js", () => ({
  fetchCourseModules: async () => ({ course: COURSE, modules: [LESSON] }),
  fetchCourseProgress: async () => [],
  fetchModuleSections: async () => null,
  fetchModuleText,
  moduleFigureUrl: (moduleId, fileId) => `/api/modules/${moduleId}/figures/${fileId}`,
  moduleFileUrl: () => "",
  setModuleCompleted: async () => ({ completed: true })
}));

jest.unstable_mockModule("../src/services/assessments.js", () => ({
  fetchCourseAssessments: async () => ({ assessments: [], assessOnly: false }),
  fetchAssessment: jest.fn(),
  submitAssessment: jest.fn()
}));

jest.unstable_mockModule("../src/services/preAssessments.js", () => ({
  fetchCoursePreAssessments: async () => [],
  submitPreAssessment: jest.fn()
}));

let LearningModules, MemoryRouter, Routes, Route, clearStanding;

beforeAll(async () => {
  ({ MemoryRouter, Routes, Route } = await import("react-router-dom"));
  ({ clearStanding } = await import("../src/auth/services/standing.js"));
  ({ default: LearningModules } = await import("../src/pages/student/LearningModules.jsx"));
});

beforeEach(() => {
  jest.useFakeTimers();
  fetchModuleText.mockReset();
  window.localStorage.clear();
  clearStanding();
});

afterEach(() => {
  jest.useRealTimers();
});

// Lets the page's promises settle and moves the clock on by `ms`.
const wait = (ms = 0) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

async function draw() {
  render(
    <MemoryRouter initialEntries={["/student/courses/c1/modules"]}>
      <Routes>
        <Route path="/student/courses/:courseId/modules" element={<LearningModules />} />
      </Routes>
    </MemoryRouter>
  );
  await wait();
}

describe("a lesson still being prepared", () => {
  it("shows Preparing lesson… and opens the lesson once it is ready", async () => {
    fetchModuleText
      .mockResolvedValueOnce({ id: "m1", status: "queued" })
      .mockResolvedValueOnce({ id: "m1", status: "extracting" })
      .mockResolvedValue(READY);

    await draw();
    expect(screen.getByText("Preparing lesson…")).toBeInTheDocument();
    expect(fetchModuleText).toHaveBeenCalledTimes(1);

    // Asked again after 2 seconds: still preparing.
    await wait(2000);
    expect(fetchModuleText).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Preparing lesson…")).toBeInTheDocument();

    // Then 4 seconds later: ready.
    await wait(4000);
    expect(fetchModuleText).toHaveBeenCalledTimes(3);
    expect(screen.queryByText("Preparing lesson…")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Writing your first program" })).toBeInTheDocument();

    // Ready means done: no more asking.
    await wait(30000);
    expect(fetchModuleText).toHaveBeenCalledTimes(3);
  });

  it("says so when the lesson couldn't be prepared, and stops asking", async () => {
    fetchModuleText.mockResolvedValue({ id: "m1", status: "failed", message: "This lesson couldn't be prepared." });

    await draw();

    expect(screen.getByRole("alert")).toHaveTextContent("This lesson couldn't be prepared.");
    expect(screen.queryByText("Preparing lesson…")).not.toBeInTheDocument();

    await wait(30000);
    expect(fetchModuleText).toHaveBeenCalledTimes(1);
  });

  it("opens a ready lesson straight away", async () => {
    fetchModuleText.mockResolvedValue(READY);

    await draw();

    expect(screen.getByRole("heading", { name: "Writing your first program" })).toBeInTheDocument();
    expect(screen.queryByText("Preparing lesson…")).not.toBeInTheDocument();
    expect(fetchModuleText).toHaveBeenCalledTimes(1);
  });
});
