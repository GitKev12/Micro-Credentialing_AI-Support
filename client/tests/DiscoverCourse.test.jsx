import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

// react-router needs these, and jsdom doesn't have them.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const { render, screen, act, fireEvent } = await import("@testing-library/react");
const { MemoryRouter, Route, Routes } = await import("react-router-dom");

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  getStoredSession: () => ({ user: { id: "stu-1" } })
}));
jest.unstable_mockModule("../src/services/courses.js", () => ({ courseImageUrl: () => "" }));

const fetchDiscoverCourse = jest.fn();
const enrollInCourse = jest.fn();
const cancelEnrollRequest = jest.fn();
jest.unstable_mockModule("../src/services/discover.js", () => ({
  fetchDiscoverCourse,
  enrollInCourse,
  cancelEnrollRequest
}));

const { default: DiscoverCourse } = await import("../src/pages/student/DiscoverCourse.jsx");

const TAUGHT = { mode: "taught", label: "Taught and assessed", enrollment: "open" };
const ASSESS = { mode: "assessOnly", label: "Assess-only", enrollment: "approval" };

// The course view as the server sends it: a course, its pathways, its syllabus.
function detail({ pathways, curriculum, ...course } = {}) {
  return {
    course: {
      id: "c1", code: "CC2", title: "Computer Programming 2", startsOn: "2026-09-01", endsOn: "2026-12-31",
      description: "Loops and arrays.", lessonCount: 12, badgeCount: 11, hasFinalExam: true, courseHours: 30,
      learnerCount: 42, enrolled: false, pending: false, myMode: null, ...course
    },
    pathways: pathways ?? [TAUGHT, ASSESS],
    curriculum: curriculum ?? [
      { id: "m1", title: "Looping", badge: "Looping" },
      { id: "m2", title: "Arrays", badge: null }
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

beforeEach(() => {
  fetchDiscoverCourse.mockReset();
  enrollInCourse.mockReset();
  cancelEnrollRequest.mockReset();
});

describe("Discover course view", () => {
  it("shows the course, its syllabus and how many are on it", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    await show();

    expect(fetchDiscoverCourse).toHaveBeenCalledWith("stu-1", "c1");
    expect(screen.getByRole("heading", { level: 1, name: "Computer Programming 2" })).toBeTruthy();
    expect(screen.getByText("Loops and arrays.")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("42 already enrolled")).toBeTruthy();
    // The lesson and the badge it earns share a name, so both show.
    expect(screen.getAllByText("Looping")).toHaveLength(2);
    expect(screen.getByText("Final exam")).toBeTruthy();
  });

  it("shows how many hours the course takes", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    await show();

    expect(screen.getByText("Hours")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
  });

  it("says nothing about hours on a course with none set", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ courseHours: null }));
    await show();

    expect(screen.queryByText("Hours")).toBeNull();
  });

  it("names no section and shows no schedule", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    await show();

    expect(screen.queryByText(/Section-/)).toBeNull();
    expect(screen.queryByText(/Room 301/)).toBeNull();
    expect(screen.queryByText(/Mon Wed/)).toBeNull();
  });

  it("offers the two pathways and takes the chosen one", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    enrollInCourse.mockResolvedValue(detail({ pending: true, myMode: "assessOnly" }));
    await show();

    // Nothing is chosen for them when there are two, so the button waits.
    expect(screen.getByRole("button", { name: "Enroll" }).disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /Assess-only/ }));
    // The wording follows the pathway: this one is gated.
    const ask = screen.getByRole("button", { name: "Request to enroll" });

    fireEvent.click(ask);
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(document.activeElement).toBe(confirm);
    expect(enrollInCourse).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(enrollInCourse).toHaveBeenCalledWith("stu-1", "c1", "assessOnly");
    expect(screen.getByText("Request pending")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Request sent. An administrator will review it.");
  });

  it("chooses for the student when only one pathway runs", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ pathways: [TAUGHT] }));
    enrollInCourse.mockResolvedValue(detail({ enrolled: true, myMode: "taught" }));
    await show();

    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enroll" }));
    expect(screen.getByText("Enroll now? Only an administrator can take you out afterwards.")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    });

    expect(enrollInCourse).toHaveBeenCalledWith("stu-1", "c1", "taught");
    expect(screen.getByText("Enrolled")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open course" }).getAttribute("href")).toBe("/student/courses/c1/modules");
  });

  it("goes back to the button when the student cancels", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ pathways: [TAUGHT] }));
    await show();

    fireEvent.click(screen.getByRole("button", { name: "Enroll" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Enroll" })).toBeTruthy();
    expect(enrollInCourse).not.toHaveBeenCalled();
  });

  it("shows the server's refusal in the card", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ pathways: [TAUGHT] }));
    enrollInCourse.mockRejectedValue({ response: { data: { message: "This course isn't open for enrollment." } } });
    await show();

    fireEvent.click(screen.getByRole("button", { name: "Enroll" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    });

    expect(screen.getByRole("alert").textContent).toBe("This course isn't open for enrollment.");
    // The confirm closes; a refused course won't take a second try.
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(screen.getByRole("button", { name: "Enroll" })).toBeTruthy();
  });

  it("lets the student take back a pending request", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ pending: true, myMode: "taught" }));
    cancelEnrollRequest.mockResolvedValue(detail({ pathways: [TAUGHT] }));
    await show();

    expect(screen.getByText("Request pending")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    });

    expect(cancelEnrollRequest).toHaveBeenCalledWith("stu-1", "c1");
    expect(screen.getByRole("button", { name: "Enroll" })).toBeTruthy();
  });

  it("says so when nothing is open", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ pathways: [] }));
    await show();

    expect(screen.getByText("This course isn't open for enrollment right now.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enroll" })).toBeNull();
  });
});
