import { describe, it, expect } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

// react-router needs these, and jsdom doesn't have them.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const { render, screen } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");
const { default: Badges } = await import("../src/pages/student/components/Badges.jsx");

describe("the student's badges", () => {
  it("sends a student with none back to My Courses", () => {
    render(
      <MemoryRouter>
        <Badges badges={[]} />
      </MemoryRouter>
    );

    expect(screen.getByText("No Badges Yet")).toBeInTheDocument();
    expect(screen.getByText("Continue your courses and pass a lesson quiz to earn one.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to My Courses" })).toHaveAttribute("href", "/student");
  });
});
