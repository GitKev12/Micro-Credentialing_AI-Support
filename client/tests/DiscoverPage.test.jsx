import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

// react-router needs these, and jsdom doesn't have them.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const { render, screen, act, fireEvent } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");

jest.unstable_mockModule("../src/assets/no-courses-student.png", () => ({ default: "" }));
jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  getStoredSession: () => ({ user: { id: "stu-1" } })
}));
jest.unstable_mockModule("../src/services/courses.js", () => ({ courseImageUrl: () => "" }));

const fetchDiscoverCourses = jest.fn();
jest.unstable_mockModule("../src/services/discover.js", () => ({ fetchDiscoverCourses }));

const { default: DiscoverPage } = await import("../src/pages/student/DiscoverPage.jsx");

const card = (extra) => ({
  id: "c1", code: "CC2", title: "Computer Programming 2", startsOn: "2026-09-01", endsOn: "2026-12-31",
  hasImage: false, sectionCount: 2, enrolled: false, pending: false, ...extra
});

async function show() {
  await act(async () => {
    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );
  });
}

beforeEach(() => {
  fetchDiscoverCourses.mockReset();
});

describe("Discover cards", () => {
  it("shows one card per course, each opening its course view", async () => {
    fetchDiscoverCourses.mockResolvedValue([
      card(),
      card({ id: "c2", code: "OOP", title: "Object-Oriented Programming", sectionCount: 1, enrolled: true }),
      card({ id: "c3", code: "EA", title: "Enterprise Architecture", sectionCount: 1, pending: true })
    ]);
    await show();

    expect(fetchDiscoverCourses).toHaveBeenCalledWith("stu-1");
    expect(screen.getByText("3 courses")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Computer Programming 2" }).getAttribute("href")).toBe("/student/discover/c1");
    expect(screen.getByText("2 sections")).toBeTruthy();
    expect(screen.getAllByText("1 section")).toHaveLength(2);
    expect(screen.getByText("Enrolled")).toBeTruthy();
    expect(screen.getByText("Request pending")).toBeTruthy();
  });

  it("says so when nothing is open", async () => {
    fetchDiscoverCourses.mockResolvedValue([]);
    await show();

    expect(screen.getByText("No courses are open for enrollment yet.")).toBeTruthy();
  });

  it("offers to try again after a failed load", async () => {
    fetchDiscoverCourses.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([card()]);
    await show();

    expect(screen.getByRole("alert").textContent).toContain("Couldn't load courses.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(screen.getByRole("link", { name: "Computer Programming 2" })).toBeTruthy();
  });
});
