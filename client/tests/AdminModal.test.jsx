import { describe, it, expect, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, fireEvent } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

let AdminModal, AdminSelect;

beforeAll(async () => {
  const module = await import("../src/pages/admin/components/ui.jsx");
  AdminModal = module.AdminModal;
  AdminSelect = module.AdminSelect;
});

const backdrop = (container) => container.querySelector(".admin-modal");
const panel = (container) => container.querySelector(".admin-modal__panel");

describe("AdminModal — dismissing it", () => {
  it("closes on a click that starts and ends on the backdrop", () => {
    let closed = 0;
    const { container } = render(
      <AdminModal title="New course" onClose={() => (closed += 1)}>
        <input aria-label="Course title" defaultValue="Programming 2" />
      </AdminModal>
    );

    fireEvent.mouseDown(backdrop(container));
    fireEvent.click(backdrop(container));

    expect(closed).toBe(1);
  });

  // Selecting text in a field and releasing outside the panel lands a click on
  // the backdrop. Read as a dismissal it threw away a form the admin was in
  // the middle of filling in — which is the one thing a drag must never do.
  it("stays open when the press began inside the panel", () => {
    let closed = 0;
    const { container } = render(
      <AdminModal title="New course" onClose={() => (closed += 1)}>
        <input aria-label="Course title" defaultValue="Programming 2" />
      </AdminModal>
    );

    fireEvent.mouseDown(panel(container));
    fireEvent.click(backdrop(container));

    expect(closed).toBe(0);
  });

  it("ignores a click inside the panel", () => {
    let closed = 0;
    const { container } = render(
      <AdminModal title="New course" onClose={() => (closed += 1)}>
        <input aria-label="Course title" defaultValue="Programming 2" />
      </AdminModal>
    );

    fireEvent.mouseDown(panel(container));
    fireEvent.click(panel(container));

    expect(closed).toBe(0);
  });

  it("does not latch the backdrop press into the next click", () => {
    let closed = 0;
    const { container } = render(
      <AdminModal title="New course" onClose={() => (closed += 1)}>
        <input aria-label="Course title" defaultValue="Programming 2" />
      </AdminModal>
    );

    fireEvent.mouseDown(backdrop(container));
    fireEvent.click(backdrop(container));
    expect(closed).toBe(1);

    // A press that starts inside must not inherit the last one's answer.
    fireEvent.mouseDown(panel(container));
    fireEvent.click(backdrop(container));
    expect(closed).toBe(1);
  });
});

describe("AdminSelect — Escape inside a form", () => {
  const OPTIONS = [
    { value: "c1", label: "Computer Programming 2" },
    { value: "c2", label: "Data Structures" }
  ];

  // The dropdown sits inside the class form, which closes on a window-level
  // Escape. Closing the list was taking the form down with it.
  it("closes the list without closing the form around it", () => {
    let closed = 0;
    render(
      <AdminModal title="Edit class" onClose={() => (closed += 1)}>
        <AdminSelect value="" onChange={() => {}} options={OPTIONS} label="Course" />
      </AdminModal>
    );

    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(closed).toBe(0);
  });

  it("leaves Escape to the form once the list is shut", () => {
    let closed = 0;
    render(
      <AdminModal title="Edit class" onClose={() => (closed += 1)}>
        <AdminSelect value="" onChange={() => {}} options={OPTIONS} label="Course" />
      </AdminModal>
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    expect(closed).toBe(1);
  });
});
