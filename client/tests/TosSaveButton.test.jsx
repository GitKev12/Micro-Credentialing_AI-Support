import { describe, it, expect, beforeAll, afterEach, jest } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

// The editor talks to the server through this service; tests answer for it.
const saveCourseTos = jest.fn();
jest.unstable_mockModule("../src/services/assessors.js", () => ({
  storedAssessorId: () => "assessor-1",
  fetchCourseTos: async () => ({
    tos: null,
    course: { code: "CC2" },
    lessons: [{ id: "m1", title: "Creating Java Programs" }]
  }),
  saveCourseTos
}));

const { act, fireEvent, render, screen } = await import("@testing-library/react");

let SaveButton;
let TosEditor;

beforeAll(async () => {
  SaveButton = (await import("../src/pages/assessor/components/tos/SaveButton.jsx")).default;
  TosEditor = (await import("../src/pages/assessor/components/tos/TosEditor.jsx")).default;
});

afterEach(() => {
  jest.useRealTimers();
  saveCourseTos.mockReset();
});

describe("SaveButton", () => {
  it("reads Save changes before anything happens", () => {
    render(<SaveButton state="idle" />);

    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toBeEnabled();
    expect(button.querySelector(".tos-save__icon")).toBeNull();
  });

  it("can't be pressed twice while saving", () => {
    render(<SaveButton state="saving" />);

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("shows a check and Saved after a save", () => {
    render(<SaveButton state="saved" />);

    const button = screen.getByRole("button", { name: "Saved" });
    expect(button).toHaveAttribute("data-state", "saved");
    expect(button.querySelector(".tos-save__stroke")).not.toBeNull();
    // A check on its own, no circle.
    expect(button.querySelector(".tos-save__ring")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Blueprint saved.");
  });

  it("shows an X in a circle and Not saved when the save fails", () => {
    render(<SaveButton state="failed" />);

    const button = screen.getByRole("button", { name: "Not saved" });
    expect(button).toHaveAttribute("data-state", "failed");
    expect(button.querySelector(".tos-save__ring")).not.toBeNull();
    expect(button.querySelector(".tos-save__stroke")).not.toBeNull();
    // Still pressable, so the assessor can try again straight away.
    expect(button).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("That did not save. Try again.");
  });
});

describe("TosEditor save", () => {
  async function openEditor(props = {}) {
    jest.useFakeTimers();
    render(<TosEditor courseId="course-1" defaultMode="lesson" defaultLesson="m1" {...props} />);
    // Let the blueprint load.
    await act(async () => {});
  }

  async function pressSave() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });
  }

  it("goes green with Saved, then back to Save changes", async () => {
    saveCourseTos.mockResolvedValue({ tos: { rows: [] } });
    await openEditor();
    await pressSave();

    expect(saveCourseTos).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saved" })).toHaveAttribute("data-state", "saved");

    act(() => jest.advanceTimersByTime(2500));
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveAttribute("data-state", "idle");
  });

  it("goes red with Not saved when the server refuses, then back to Save changes", async () => {
    saveCourseTos.mockRejectedValue(new Error("offline"));
    await openEditor();
    await pressSave();

    expect(screen.getByRole("button", { name: "Not saved" })).toHaveAttribute("data-state", "failed");

    act(() => jest.advanceTimersByTime(2500));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("grows the frame it was given when the paper switches", async () => {
    // The height it is at when the switch starts, then the height the new
    // paper has left it at.
    const heights = [400, 620];
    const animate = jest.fn(() => ({ cancel: jest.fn() }));
    const frame = {
      current: {
        animate,
        get offsetHeight() {
          return heights.length > 1 ? heights.shift() : heights[0];
        }
      }
    };
    await openEditor({ frame });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Final exam" }));
    });

    expect(animate).toHaveBeenCalledWith(
      [{ height: "400px" }, { height: "620px" }],
      expect.objectContaining({ duration: expect.any(Number) })
    );
    expect(screen.getByRole("heading", { name: "The exam" })).toBeInTheDocument();
  });
});
