import { describe, it, expect } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { Chip } from "../src/pages/assessor/components/ui.jsx";

/**
 * One rendered component, mostly to hold the jsdom half of the setup honest:
 * if JSX stops compiling or the DOM environment goes missing, this fails first
 * and says so plainly.
 */
describe("Chip", () => {
  it("renders its children", () => {
    render(<Chip>Ready to release</Chip>);
    expect(screen.getByText("Ready to release")).toBeInTheDocument();
  });

  it("carries its tone as a modifier class", () => {
    render(<Chip tone="danger">Below 30</Chip>);
    expect(screen.getByText("Below 30")).toHaveClass("chip", "chip--danger");
  });

  it("falls back to the neutral tone", () => {
    render(<Chip>Manual grading</Chip>);
    expect(screen.getByText("Manual grading")).toHaveClass("chip--neutral");
  });

  it("adds the dot only when asked, and hides it from screen readers", () => {
    const { container, rerender } = render(<Chip>No dot</Chip>);
    expect(container.querySelector(".chip__dot")).toBeNull();

    rerender(<Chip dot>With dot</Chip>);
    const dot = container.querySelector(".chip__dot");
    expect(dot).not.toBeNull();
    // The dot repeats what the label already says.
    expect(dot).toHaveAttribute("aria-hidden", "true");
  });
});
