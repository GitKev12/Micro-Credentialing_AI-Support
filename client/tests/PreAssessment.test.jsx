import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

// react-router needs these, and jsdom doesn't have them.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const { render, screen, fireEvent, act } = await import("@testing-library/react");
const { MemoryRouter, Route, Routes } = await import("react-router-dom");

// The services read Vite's env, which Jest can't parse, so they are stubbed.
const submitPreAssessment = jest.fn();
jest.unstable_mockModule("../src/services/preAssessments.js", () => ({ submitPreAssessment }));

const fetchModulePreAssessment = jest.fn();
const saveModulePreAssessment = jest.fn();
jest.unstable_mockModule("../src/services/admin.js", () => ({
  fetchModulePreAssessment,
  saveModulePreAssessment,
  deleteModulePreAssessment: jest.fn()
}));

const PreAssessmentRunner = (await import("../src/pages/student/components/PreAssessmentRunner.jsx")).default;
const PreAssessmentPage = (await import("../src/pages/admin/PreAssessmentPage.jsx")).default;

const items = [
  { id: "p1", type: "multiple-choice", q: "First index?", choices: [{ id: "a", text: "0" }, { id: "b", text: "1" }] },
  { id: "p2", type: "true-false", q: "Fixed size?", choices: [{ id: "true", text: "True" }, { id: "false", text: "False" }] }
];

beforeEach(() => {
  submitPreAssessment.mockReset();
  fetchModulePreAssessment.mockReset();
  saveModulePreAssessment.mockReset();
});

describe("student: taking a Pre-Assessment", () => {
  it("submits once every question is answered", async () => {
    const attempt = { score: 1, total: 2, answers: { p1: "a", p2: "false" }, items };
    submitPreAssessment.mockResolvedValue(attempt);
    const onSubmitted = jest.fn();
    render(
      <PreAssessmentRunner
        studentId="s1"
        preAssessment={{ id: "pa1", items, attempt: null }}
        onSubmitted={onSubmitted}
      />
    );

    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("0"));
    fireEvent.click(screen.getByLabelText("False"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    });
    expect(submitPreAssessment).toHaveBeenCalledWith("s1", "pa1", { p1: "a", p2: "false" });
    expect(onSubmitted).toHaveBeenCalledWith("pa1", attempt);
  });

  it("shows the score and the right answers once taken", () => {
    const keyed = items.map((item, at) => ({ ...item, key: at === 0 ? "a" : "true" }));
    render(
      <PreAssessmentRunner
        studentId="s1"
        preAssessment={{ id: "pa1", items, attempt: { score: 1, total: 2, answers: { p1: "a", p2: "false" }, items: keyed } }}
        onSubmitted={() => {}}
      />
    );

    expect(screen.getByText("1 of 2 correct")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.getByLabelText("0").closest("label").className).toContain("is-correct");
  });
});

describe("admin: the Pre-Assessment page", () => {
  const open = async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/admin/courses/c1/lessons/m1/pre-assessment"]}>
          <Routes>
            <Route path="/admin/courses/:courseId/lessons/:moduleId/pre-assessment" element={<PreAssessmentPage />} />
          </Routes>
        </MemoryRouter>
      );
    });
  };

  it("starts with one blank question and adds up to five", async () => {
    fetchModulePreAssessment.mockResolvedValue({ module: { id: "m1", title: "Arrays", courseCode: "CC2" }, preAssessment: null });
    await open();

    expect(screen.getByText("CC2 · Arrays")).toBeTruthy();
    for (let n = 0; n < 4; n += 1) fireEvent.click(screen.getByRole("button", { name: "Question" }));
    expect(screen.getByText("Question 5")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Question" })).toBeNull();
  });

  it("saves the questions with Enable for students", async () => {
    fetchModulePreAssessment.mockResolvedValue({ module: { id: "m1", title: "Arrays" }, preAssessment: null });
    saveModulePreAssessment.mockResolvedValue({ id: "pa1", active: true, items: [] });
    await open();

    fireEvent.click(screen.getByLabelText("Enable for students"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(saveModulePreAssessment).toHaveBeenCalledWith("m1", expect.objectContaining({ active: true }));
  });
});
