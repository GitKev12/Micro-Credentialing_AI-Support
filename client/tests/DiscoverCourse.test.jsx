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

const TAUGHT = { mode: "taught", label: "Taught and assessed", enrollment: "open", assessor: "Ramon Velasco", certificate: "CC2 Final Exam Credential" };
const ASSESS = { mode: "assessOnly", label: "Assess-only", enrollment: "approval", assessor: "Marivic Cortez", certificate: "CC2 Final Exam Credential" };

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

  it("shows the dates the course runs between", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    await show();

    expect(screen.getByText("Runs")).toBeTruthy();
    // The length in weeks is deliberately not shown here.
    expect(screen.queryByText("Length")).toBeNull();
    expect(screen.queryByText("17 weeks")).toBeNull();
  });

  it("leaves out the run on a course with no dates", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ startsOn: null, endsOn: null }));
    await show();

    expect(screen.queryByText("Runs")).toBeNull();
  });

  it("says nothing about hours on a course with none set", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ courseHours: null }));
    await show();

    expect(screen.queryByText("Hours")).toBeNull();
  });

  it("says how the course is taken beside its code", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ pathways: [ASSESS] }));
    await show();

    const head = document.querySelector(".sd-dcourse__head");
    expect(head.querySelectorAll(".sd-dcourse__mode")).toHaveLength(1);
    expect(head.textContent).toContain("Assess-only");
  });

  it("names every way in until one is picked, then that one", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    await show();

    expect(document.querySelectorAll(".sd-dcourse__mode")).toHaveLength(2);

    fireEvent.click(screen.getByRole("radio", { name: /Assess-only/ }));
    const modes = document.querySelectorAll(".sd-dcourse__mode");
    expect(modes).toHaveLength(1);
    expect(modes[0].textContent).toBe("Assess-only");
  });

  it("names the way the student is already on", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ enrolled: true, myMode: "taught", myModeLabel: "Taught and assessed" }));
    await show();

    const modes = document.querySelectorAll(".sd-dcourse__mode");
    expect(modes).toHaveLength(1);
    expect(modes[0].textContent).toBe("Taught and assessed");
  });

  it("still names it after their class stops being open on Discover", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ enrolled: true, myMode: "assessOnly", myModeLabel: "Assess-only", pathways: [] }));
    await show();

    const modes = document.querySelectorAll(".sd-dcourse__mode");
    expect(modes).toHaveLength(1);
    expect(modes[0].textContent).toBe("Assess-only");
  });

  it("names both assessors until a pathway is picked, then that one's", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    await show();

    expect(screen.getByText("Assessors")).toBeTruthy();
    expect(screen.getByText("Ramon Velasco, Marivic Cortez")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /Assess-only/ }));
    expect(screen.getByText("Assessor")).toBeTruthy();
    expect(screen.getByText("Marivic Cortez")).toBeTruthy();
  });

  it("lists the facts in order: when, how much work, what is in it, who", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    await show();

    const labels = [...document.querySelectorAll(".sd-dcourse__facts dt")].map((dt) => dt.textContent);
    expect(labels).toEqual(["Runs", "Hours", "Lessons", "Badges", "Assessors"]);
  });

  it("names the certificate the course awards, once", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail());
    await show();

    const section = screen.getByRole("region", { name: "Certificate" });
    // The course has one credential however many pathways lead to it.
    expect(section.querySelectorAll(".sd-dcert__name")).toHaveLength(1);
    expect(section.textContent).toContain("CC2 Certification");
    expect(section.textContent).toContain("Your assessor releases it after you pass the final exam.");
  });

  it("leaves the certificate out while there is no final to earn it with", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ pathways: [{ ...TAUGHT, certificate: null }] }));
    await show();

    expect(screen.queryByRole("region", { name: "Certificate" })).toBeNull();
  });

  it("names the student's own assessor once they have asked to join", async () => {
    fetchDiscoverCourse.mockResolvedValue(detail({ pending: true, myMode: "taught", myAssessor: "Ramon Velasco" }));
    await show();

    expect(screen.getByText("Assessor")).toBeTruthy();
    expect(screen.getByText("Ramon Velasco")).toBeTruthy();
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
    // No "Enrolled" tag: the way in is the link, and the status line says so.
    expect(screen.queryByText("Enrolled")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("You're enrolled.");
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
