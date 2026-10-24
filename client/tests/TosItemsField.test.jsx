import { describe, it, expect, beforeAll, jest } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

// A course with no ToS saved yet, so every lesson starts with no levels.
jest.unstable_mockModule("../src/services/assessors.js", () => ({
  storedAssessorId: () => "assessor-1",
  fetchCourseTos: async () => ({
    tos: null,
    course: { code: "CC2" },
    lessons: [{ id: "m1", title: "Creating Java Programs" }]
  }),
  saveCourseTos: jest.fn()
}));

const { act, fireEvent, render, screen } = await import("@testing-library/react");

let TosEditor;

beforeAll(async () => {
  TosEditor = (await import("../src/pages/assessor/components/tos/TosEditor.jsx")).default;
});

async function openEditor(mode) {
  render(<TosEditor courseId="course-1" defaultMode={mode} defaultLesson="m1" />);
  await act(async () => {});
}

function typeInto(name, value) {
  const field = screen.getByRole("textbox", { name });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
  return field;
}

describe("No. Items", () => {
  it("is a plain box, with no + or - buttons", async () => {
    await openEditor("lesson");

    expect(screen.getByRole("textbox", { name: "No. Items" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /No\. Items/ })).toBeNull();
  });

  // The reported bug: typing a number on a lesson with no levels yet gave 0.
  it("keeps the number typed on a lesson with no levels yet", async () => {
    await openEditor("lesson");

    expect(typeInto("No. Items", "10")).toHaveValue("10");
    // And the levels open on the 30/70 default: 3 LOTS, 7 HOTS.
    expect(screen.getByRole("textbox", { name: "True or False" })).toHaveValue("3");
    expect(screen.getByRole("textbox", { name: "Multiple Choice" })).toHaveValue("7");
  });

  it("keeps the number typed on the final exam", async () => {
    await openEditor("final");

    expect(typeInto("No. Items", "30")).toHaveValue("30");
  });

  it("puts the old number back when the box is left empty", async () => {
    await openEditor("lesson");
    typeInto("No. Items", "10");

    expect(typeInto("No. Items", "")).toHaveValue("10");
  });
});
