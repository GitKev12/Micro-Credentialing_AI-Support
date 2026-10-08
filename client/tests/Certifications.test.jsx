import { describe, it, expect, jest, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

// react-router needs these, and jsdom doesn't have them.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const { render, screen } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  getStoredSession: () => ({ user: { id: "st1" } })
}));
jest.unstable_mockModule("../src/services/achievements.js", () => ({
  certificateFileUrl: () => "#"
}));

let Certifications;

beforeAll(async () => {
  ({ default: Certifications } = await import("../src/pages/student/components/Certifications.jsx"));
});

const CC2 = {
  id: "r1",
  name: "CC2 Final Exam Credential",
  courseCode: "CC2",
  courseTitle: "Computer Programming 2",
  assessmentTitle: "CC2 Final Exam",
  status: "pending",
  score: 41,
  totalPoints: 60
};

describe("the student's micro-credentials", () => {
  it("names each one by course code, with only the course under it", () => {
    render(<Certifications certifications={[CC2]} />);

    expect(screen.getByText("CC2 Certification")).toBeInTheDocument();
    expect(screen.getByText("Computer Programming 2")).toBeInTheDocument();
    expect(screen.queryByText("CC2 Final Exam Credential")).not.toBeInTheDocument();
  });

  it("keeps the saved name when the course is gone", () => {
    render(<Certifications certifications={[{ ...CC2, courseCode: "", courseTitle: "" }]} />);

    expect(screen.getByText("CC2 Final Exam Credential")).toBeInTheDocument();
  });

  it("sends a student with none back to My Courses", () => {
    render(
      <MemoryRouter>
        <Certifications certifications={[]} />
      </MemoryRouter>
    );

    expect(screen.getByText("No Certifications Yet")).toBeInTheDocument();
    expect(screen.getByText("Continue your courses and pass a final exam to earn one.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to My Courses" })).toHaveAttribute("href", "/student");
  });
});
