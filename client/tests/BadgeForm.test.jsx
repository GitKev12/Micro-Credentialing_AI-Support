import { describe, it, expect, jest } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";

// The services read Vite's env, which Jest can't parse, so they are stubbed.
jest.unstable_mockModule("../src/services/admin.js", () => ({ MAX_BADGE_ICON_BYTES: 100 * 1024 }));

const BadgeForm = (await import("../src/pages/admin/components/course/BadgeForm.jsx")).default;

const lesson = { id: "m1", title: "Arrays", badge: null };
const icon = "data:image/svg+xml;base64,PHN2Zy8+";

const draw = (props = {}) =>
  render(<BadgeForm module={lesson} busy={false} onCancel={() => {}} onSave={() => {}} {...props} />);

describe("Badge form", () => {
  it("starts from the lesson's name, switched off, and waits for a picture", () => {
    draw();
    expect(screen.getByDisplayValue("Arrays")).toBeTruthy();
    expect(screen.getByLabelText("Enable access").checked).toBe(false);
    expect(screen.getByRole("button", { name: "Add badge" }).disabled).toBe(true);
    expect(screen.getByText("Pass this lesson's quiz")).toBeTruthy();
  });

  it("saves an existing badge without resending its picture", () => {
    const onSave = jest.fn();
    draw({
      module: { ...lesson, badge: { id: "b1", title: "Arrays", description: "", icon, active: false } },
      onSave
    });
    fireEvent.click(screen.getByLabelText("Enable access"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith({ title: "Arrays", description: "", active: true });
  });

  it("asks once more before deleting", () => {
    const onDelete = jest.fn();
    draw({ module: { ...lesson, badge: { id: "b1", title: "Arrays", icon, active: true } }, onDelete });

    fireEvent.click(screen.getByRole("button", { name: "Delete badge" }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete badge" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
