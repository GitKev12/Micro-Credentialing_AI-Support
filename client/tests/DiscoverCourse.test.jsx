import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

// react-router needs these, and jsdom doesn't have them.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const { render, screen, act, fireEvent, within } = await import("@testing-library/react");
const { MemoryRouter, Route, Routes } = await import("react-router-dom");

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  getStoredSession: () => ({ user: { id: "stu-1" } })
}));
jest.unstable_mockModule("../src/services/courses.js", () => ({ courseImageUrl: () => "" }));

const fetchDiscoverCourse = jest.fn();
const enrollInClass = jest.fn();
const cancelEnrollRequest = jest.fn();
jest.unstable_mockModule("../src/services/discover.js", () => ({
  fetchDiscoverCourse,
  enrollInClass,
  cancelEnrollRequest
}));

const { default: DiscoverCourse } = await import("../src/pages/student/DiscoverCourse.jsx");

const section = (extra) => ({
  id: "k1", name: "Section-A", mode: "taught", enrollment: "open", assessor: "Ramon Velasco",
  schedule: { days: "Mon Wed", time: "9:00-10:30", room: "Room 301" }, hasFinalExam: true,
  state: "none", open: true, ...extra
});

// The course view as the server sends it, with `sections` and course flags overridable.
function detail({ sections, ...course } = {}) {
  return {
    course: {
      id: "c1", code: "CC2", title: "Computer Programming 2", startsOn: "2026-09-01", endsOn: "2026-12-31",
      description: "Loops and arrays.", lessonCount: 12, badgeCount: 11, hasFinalExam: true,
      enrolled: false, pending: false, ...course
    },
    sections: sections ?? [
      section(),
      section({ id: "k2", name: "Section-B", mode: "assessOnly", enrollment: "approval", assessor: "Marivic Cortez" })
    ]
  };
}

async function show() {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={["/student/discover/c1"]}>
        <Routes>
          <Route path="/student/discover/:courseId" element={<DiscoverCourse />} />
        </Routes>
      </MemoryRouter>
    );
  });
}

const row = (name) => screen.getByRole("heading", { name }).closest("li");

beforeEach(() => {
  fetchDiscoverCourse.mockReset();
  enrollInClass.mockReset();
  cancelEnrollRequest.mockReset();
});

describe("Discover course view", () => {
  it("shows the facts and one action per section", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    await show();

    expect(fetchDiscoverCourse).toHaveBeenCalledWith("stu-1", "c1");
    expect(screen.getByRole("heading", { name: "Computer Programming 2" })).toBeTruthy();
    expect(screen.getByText("Loops and arrays.")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Posted")).toBeTruthy();
    expect(within(row("Section-A")).getByRole("button", { name: "Enroll" })).toBeTruthy();
    expect(within(row("Section-B")).getByRole("button", { name: "Request to enroll" })).toBeTruthy();
    expect(within(row("Section-B")).getByText("Assessment only")).toBeTruthy();
  });

  it("asks before enrolling, then shows the place", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    enrollInClass.mockResolvedValue(
      detail({ enrolled: true, sections: [section({ state: "enrolled" }), section({ id: "k2", name: "Section-B", enrollment: "approval" })] })
    );
    await show();

    fireEvent.click(within(row("Section-A")).getByRole("button", { name: "Enroll" }));
    expect(screen.getByText("Enroll in Section-A? Only an administrator can take you out of a class.")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(document.activeElement).toBe(confirm);
    expect(enrollInClass).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(enrollInClass).toHaveBeenCalledWith("stu-1", "k1");
    expect(within(row("Section-A")).getByText("Enrolled")).toBeTruthy();
    expect(within(row("Section-A")).getByRole("link", { name: "Open course" }).getAttribute("href")).toBe("/student/courses/c1/modules");
    // Once in a section, the others offer nothing.
    expect(within(row("Section-B")).queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Enrolled in Section-A.");
  });

  it("goes back to the button when the student cancels", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    await show();

    fireEvent.click(within(row("Section-B")).getByRole("button", { name: "Request to enroll" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(within(row("Section-B")).getByRole("button", { name: "Request to enroll" })).toBeTruthy();
    expect(enrollInClass).not.toHaveBeenCalled();
  });

  it("shows the server's refusal under the section", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    enrollInClass.mockRejectedValue({ response: { data: { message: "This class isn't open for enrollment." } } });
    await show();

    fireEvent.click(within(row("Section-A")).getByRole("button", { name: "Enroll" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    });

    expect(within(row("Section-A")).getByRole("alert").textContent).toBe("This class isn't open for enrollment.");
    // The confirm closes; a refused class won't take a second try.
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(within(row("Section-A")).getByRole("button", { name: "Enroll" })).toBeTruthy();
  });

  it("lets the student take back a pending request", async () => {
    fetchDiscoverCourse.mockResolvedValue(
      detail({ pending: true, sections: [section({ enrollment: "approval", state: "pending" })] })
    );
    cancelEnrollRequest.mockResolvedValue(detail({ sections: [section({ enrollment: "approval" })] }));
    await show();

    expect(within(row("Section-A")).getByText("Request pending")).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(row("Section-A")).getByRole("button", { name: "Cancel request" }));
    });

    expect(cancelEnrollRequest).toHaveBeenCalledWith("stu-1", "k1");
    expect(within(row("Section-A")).getByRole("button", { name: "Request to enroll" })).toBeTruthy();
  });
});
