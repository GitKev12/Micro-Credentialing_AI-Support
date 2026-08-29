import { describe, it, expect, jest } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdminField } from "../src/pages/admin/components/ui.jsx";

describe("AdminField", () => {
  it("renders a textarea when multiline, and still reports edits", () => {
    const onChange = jest.fn();
    render(<AdminField label="Description" value="Hi" onChange={onChange} multiline rows={5} />);

    const field = screen.getByLabelText("Description");
    expect(field.tagName).toBe("TEXTAREA");
    expect(field).toHaveAttribute("rows", "5");
    expect(field).toHaveClass("admin-input", "admin-input--multiline");
    expect(field).toHaveValue("Hi");

    fireEvent.change(field, { target: { value: "Hi there" } });
    expect(onChange).toHaveBeenCalledWith("Hi there");
  });

  it("is still a single-line input by default", () => {
    render(<AdminField label="Course code" value="" onChange={() => {}} />);
    const field = screen.getByLabelText("Course code");
    expect(field.tagName).toBe("INPUT");
    expect(field).toHaveAttribute("type", "text");
  });
});
