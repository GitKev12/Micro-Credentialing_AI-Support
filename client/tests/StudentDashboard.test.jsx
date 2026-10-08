import { describe, it, expect, jest } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

// react-router needs these, and jsdom doesn't have them.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const { render, screen, act } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  getStoredSession: () => ({ user: { id: "stu-1" } }),
  clearAuthSession: () => {}
}));
jest.unstable_mockModule("../src/services/avatar.js", () => ({
  getInitials: () => "ST",
  resolveAvatarUrl: () => null
}));
// A student who isn't in any course yet.
jest.unstable_mockModule("../src/services/skillGap.js", () => ({
  fetchStudentSkillGap: async () => []
}));

const { default: StudentDashboard } = await import("../src/pages/student/StudentDashboard.jsx");

describe("the dashboard with no courses", () => {
  it("shows the message and no button", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <StudentDashboard />
        </MemoryRouter>
      );
    });

    expect(screen.getByText("No course analytics yet")).toBeInTheDocument();
    expect(screen.getByText("Enroll in a course to see your progress here.")).toBeInTheDocument();
    expect(document.querySelector(".sd-empty a, .sd-empty button")).toBeNull();
  });
});
