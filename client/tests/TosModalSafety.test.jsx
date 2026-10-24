import { describe, it, expect, beforeAll, afterEach, jest } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

// A 10-item lesson exam: Understanding 3, Analyzing 6, Creating 1.
const saveCourseTos = jest.fn();
jest.unstable_mockModule("../src/services/assessors.js", () => ({
  storedAssessorId: () => "assessor-1",
  fetchCourseTos: async () => ({
    tos: {
      rows: [
        { moduleId: "m1", remember: 0, understand: 3, apply: 0, analyze: 6, evaluate: 0, create: 1 }
      ]
    },
    course: { code: "CC2" },
    lessons: [{ id: "m1", title: "Creating Java Programs" }]
  }),
  saveCourseTos
}));

const { act, fireEvent, render, screen } = await import("@testing-library/react");

let TosModal;

beforeAll(async () => {
  TosModal = (await import("../src/pages/assessor/components/tos/TosModal.jsx")).default;
});

afterEach(() => {
  jest.useRealTimers();
  saveCourseTos.mockReset();
});

async function openModal() {
  const onClose = jest.fn();
  render(<TosModal courseId="course-1" mode="lesson" lessonId="m1" onClose={onClose} />);
  // Let the blueprint load.
  await act(async () => {});
  return onClose;
}

const level = (name) => screen.getByRole("textbox", { name });

function typeLevel(name, value) {
  fireEvent.change(level(name), { target: { value } });
  fireEvent.blur(level(name));
}

const closeButton = () => screen.getByRole("button", { name: "Close the blueprint" });
const question = () => screen.queryByText("You have unsaved changes. Discard them?");

describe("Closing with unsaved edits", () => {
  it("closes straight away when nothing changed", async () => {
    const onClose = await openModal();

    fireEvent.click(closeButton());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(question()).toBeNull();
  });

  it("asks first, and Keep editing keeps the edit", async () => {
    const onClose = await openModal();
    typeLevel("Analyzing", "5");

    fireEvent.click(closeButton());
    expect(question()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(question()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(level("Analyzing")).toHaveValue("5");
  });

  it("closes on Discard changes", async () => {
    const onClose = await openModal();
    typeLevel("Analyzing", "5");

    fireEvent.click(closeButton());
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks on a click outside the dialog too", async () => {
    const onClose = await openModal();
    typeLevel("Analyzing", "5");

    fireEvent.mouseDown(document.querySelector(".tos-modal"));

    expect(question()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("asks on Escape, and a second Escape means keep editing", async () => {
    const onClose = await openModal();
    typeLevel("Analyzing", "5");

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(question()).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(question()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores Escape while typing in a box", async () => {
    const onClose = await openModal();

    fireEvent.keyDown(level("Analyzing"), { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    expect(question()).toBeNull();
  });

  it("does not ask once the edits are saved", async () => {
    saveCourseTos.mockResolvedValue({ tos: { rows: [] } });
    const onClose = await openModal();
    typeLevel("Analyzing", "5");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });
    fireEvent.click(closeButton());

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("A level that takes from the others", () => {
  it("says what it took, and Undo puts it back", async () => {
    const onClose = await openModal();
    typeLevel("Analyzing", "10");

    expect(screen.getByText("Took 3 from Understanding, 1 from Creating.")).toBeInTheDocument();
    expect(level("Understanding")).toHaveValue("0");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(level("Analyzing")).toHaveValue("6");
    expect(level("Understanding")).toHaveValue("3");
    expect(level("Creating")).toHaveValue("1");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();

    // Back where it started, so there is nothing to lose.
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when there was free room", async () => {
    await openModal();
    typeLevel("Analyzing", "2");

    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});

describe("A failed save", () => {
  it("keeps the reason on screen after the button resets", async () => {
    jest.useFakeTimers();
    saveCourseTos.mockRejectedValue({
      response: { status: 400, data: { message: "The final exam needs at least one item." } }
    });
    await openModal();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });
    act(() => jest.advanceTimersByTime(2500));

    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not saved: The final exam needs at least one item."
    );
  });

  it("clears the reason once a save works", async () => {
    saveCourseTos.mockRejectedValueOnce(new Error("offline"));
    saveCourseTos.mockResolvedValueOnce({ tos: { rows: [] } });
    await openModal();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Not saved: Couldn't reach the server.");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Not saved" }));
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
