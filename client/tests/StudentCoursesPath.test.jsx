import { describe, it, expect, jest } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

// react-router needs these, and jsdom doesn't have them.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const { render, screen, act } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  getStoredSession: () => ({ user: { id: "stu-1" } })
}));

// One course: 4 lessons, 2 read, 1 quiz passed, 3 of 4 Pre-Assessments taken.
// A test can set `courses` to [] to see the empty page.
let courses = null;
jest.unstable_mockModule("../src/services/courses.js", () => ({
  courseImageUrl: () => "",
  fetchStudentCourses: async () => courses ?? [
    {
      id: "c1",
      code: "CC2",
      title: "Computer Programming",
      moduleCount: 4,
      completedModules: 2,
      itemCount: 13,
      completedItems: 6,
      quizzesPassed: 1,
      finalPassed: false,
      preTotal: 4,
      preDone: 3,
      status: "in-progress"
    }
  ]
}));

const { default: StudentCourses } = await import("../src/pages/student/components/StudentCourses.jsx");

describe("home course progress with Pre-Assessments", () => {
  it("shows each part from the server, not worked out by subtraction", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <StudentCourses />
        </MemoryRouter>
      );
    });

    // No stretch of its own: Pre-Assessments count in Lessons (2 read + 3 taken, of 4 + 4).
    expect(screen.queryByText("Pre-Assessments")).toBeNull();
    expect(screen.getByText("5 of 8")).toBeTruthy();
    // Exams stays at the 1 quiz actually passed.
    expect(screen.getByText("1 of 4")).toBeTruthy();
  });
});

describe("home with no courses", () => {
  it("sends the student to Discover", async () => {
    courses = [];
    await act(async () => {
      render(
        <MemoryRouter>
          <StudentCourses />
        </MemoryRouter>
      );
    });

    expect(screen.getByText("You aren't enrolled in any courses yet")).toBeTruthy();
    expect(screen.getByText("Find a course on Discover and enroll.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Discover" }).getAttribute("href")).toBe("/student/discover");
    courses = null;
  });
});
