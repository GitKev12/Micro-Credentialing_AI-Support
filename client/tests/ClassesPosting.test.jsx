import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { act, render, screen, fireEvent, within } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

// Posting a class on Discover is done from the Classes table, and its requests
// are answered in the Edit class window.

const COURSE = { id: "c1", code: "CC2", title: "Computer Programming 2" };
const ANDREA = { studentId: "s1", name: "Andrea Santiago", studentNumber: "STU001" };

const row = (extra) => ({
  id: "k1", name: "Section-A", course: COURSE, assessors: [{ id: "a1", name: "Ramon Velasco" }],
  studentCount: 0, schedule: null, active: true, archived: false, mode: "taught",
  posted: true, enrollment: "approval", refusal: null, requestCount: 1, ...extra
});

let classes = [];
const updateClass = jest.fn(async () => ({ name: "Section-A" }));
jest.unstable_mockModule("../src/services/classes.js", () => ({
  fetchClasses: async () => [...classes],
  fetchClass: async (id) => ({ ...classes.find((cls) => cls.id === id), students: [], requests: classes.find((cls) => cls.id === id).requestCount ? [ANDREA] : [] }),
  fetchClassImpact: async () => ({}),
  deleteClass: async () => ({}),
  createClass: async () => ({}),
  updateClass,
  setClassActive: async () => ({}),
  setClassArchived: async () => ({})
}));

const setDiscoverSettings = jest.fn();
const acceptRequest = jest.fn();
const declineRequest = jest.fn();
jest.unstable_mockModule("../src/services/discover.js", () => ({ setDiscoverSettings, acceptRequest, declineRequest }));

jest.unstable_mockModule("../src/services/admin.js", () => ({
  fetchNextIdNumber: async () => "",
  fetchCourses: async () => [COURSE],
  fetchStudents: async () => [{ id: "s1", name: "Andrea Santiago", enrolled: [] }],
  fetchAssessors: async () => ({ assessors: [{ id: "a1", name: "Ramon Velasco" }], coverage: {} })
}));

let ClassesManagement;
beforeAll(async () => {
  ClassesManagement = (await import("../src/pages/admin/ClassesManagement.jsx")).default;
});

beforeEach(() => {
  classes = [row(), row({ id: "k2", name: "Section-B", posted: false, requestCount: 0, assessors: [], refusal: "This class needs an assessor first." })];
  [updateClass, setDiscoverSettings, acceptRequest, declineRequest].forEach((fn) => fn.mockClear());
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
async function open() {
  render(<ClassesManagement />);
  await flush();
}
const tableRow = (name) => screen.getByRole("button", { name }).closest("tr");

async function openEdit(name) {
  fireEvent.click(screen.getByRole("button", { name }));
  await flush();
}

// The requests sit in a panel beside the form, opened from the Students field.
const openRequests = () => fireEvent.click(screen.getByRole("button", { name: "Requests, 1 waiting" }));

describe("Posting", () => {
  it("only reports it in the table, with no button to press by accident", async () => {
    await open();

    expect(within(tableRow("Section-A")).getByText("Posted")).toBeTruthy();
    expect(within(tableRow("Section-A")).getByText("1 request waiting")).toBeTruthy();
    expect(within(tableRow("Section-B")).getByText("Not posted")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^(Post|Unpost)$/ })).toBeNull();
  });

  it("asks before unposting, and keeps the waiting requests", async () => {
    setDiscoverSettings.mockResolvedValue({ posted: false, enrollment: "approval", refusal: null, requests: [ANDREA] });
    await open();
    await openEdit("Section-A");

    // Pressing Unpost only opens the pop-up; Cancel leaves the class posted.
    fireEvent.click(screen.getByRole("button", { name: "Unpost" }));
    const ask = screen.getByRole("dialog", { name: "Unpost this class?" });
    expect(within(ask).getByText("Waiting requests stay, so you can still accept or decline them.")).toBeTruthy();
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Unpost this class?" })).toBeNull();
    expect(setDiscoverSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Unpost" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "Unpost this class?" })).getByRole("button", { name: "Unpost" }));
    });

    expect(setDiscoverSettings).toHaveBeenCalledWith("k1", { posted: false });
    expect(screen.queryByRole("dialog", { name: "Unpost this class?" })).toBeNull();
    expect(screen.getByRole("button", { name: "Post to Discover" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Requests, 1 waiting" })).toBeTruthy();
    expect(screen.getByText("“Section-A” was unposted.")).toBeTruthy();
    expect(within(tableRow("Section-A")).getByText("Not posted")).toBeTruthy();
    expect(within(tableRow("Section-A")).getByText("1 request waiting")).toBeTruthy();
  });

  it("closes only the pop-up on Escape, not the Edit window", async () => {
    await open();
    await openEdit("Section-A");

    fireEvent.click(screen.getByRole("button", { name: "Unpost" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Unpost this class?" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Edit class" })).toBeTruthy();
    expect(setDiscoverSettings).not.toHaveBeenCalled();
  });

  it("posts with the enrollment chosen in the window", async () => {
    classes = [row({ posted: false, requestCount: 0 })];
    setDiscoverSettings.mockResolvedValue({ posted: true, enrollment: "open", refusal: null, requests: [] });
    await open();
    await openEdit("Section-A");

    fireEvent.click(screen.getByRole("radio", { name: /Open/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post to Discover" }));
    });

    expect(setDiscoverSettings).toHaveBeenCalledWith("k1", { posted: true, enrollment: "open" });
    expect(screen.getByRole("button", { name: "Unpost" })).toBeTruthy();
    expect(within(tableRow("Section-A")).getByText("Posted")).toBeTruthy();
  });

  it("can't post a class that can't take students, and says why", async () => {
    await open();
    await openEdit("Section-B");

    expect(screen.getByRole("button", { name: "Post to Discover" }).disabled).toBe(true);
    expect(screen.getByText("This class needs an assessor first.")).toBeTruthy();
  });

  it("shows the server's refusal in the window", async () => {
    classes = [row({ posted: false, requestCount: 0 })];
    setDiscoverSettings.mockRejectedValue({ response: { data: { message: "This course has ended." } } });
    await open();
    await openEdit("Section-A");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post to Discover" }));
    });

    expect(screen.getByRole("alert").textContent).toBe("This course has ended.");
    expect(screen.getByRole("button", { name: "Post to Discover" })).toBeTruthy();
  });
});

describe("Requests in the Edit class window", () => {
  it("opens the requests in a panel, not in the form", async () => {
    await open();
    await openEdit("Section-A");

    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    openRequests();

    const panel = screen.getByRole("dialog", { name: "Requests" });
    expect(within(panel).getByText("Andrea Santiago")).toBeTruthy();
    expect(within(panel).getByRole("status").textContent).toBe("1 student waiting");
  });

  it("accepts a request, and Save keeps the student in the class", async () => {
    acceptRequest.mockResolvedValue({});
    await open();
    await openEdit("Section-A");
    openRequests();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    });

    expect(acceptRequest).toHaveBeenCalledWith("k1", "s1");
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.getByText("No requests waiting.")).toBeTruthy();
    // The student joins the roster on the form beside the panel.
    expect(screen.getByText("1 selected")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });
    expect(updateClass.mock.calls[0][1]).toMatchObject({ studentIds: ["s1"], enrollment: "approval" });
  });

  it("declines a request", async () => {
    declineRequest.mockResolvedValue({});
    await open();
    await openEdit("Section-A");
    openRequests();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    });

    expect(declineRequest).toHaveBeenCalledWith("k1", "s1");
    expect(screen.queryByText("STU001")).toBeNull();
  });

  it("keeps the request and says why when the server refuses", async () => {
    acceptRequest.mockRejectedValue({ response: { data: { message: "This student's account isn't active." } } });
    await open();
    await openEdit("Section-A");
    openRequests();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    });

    expect(within(screen.getByRole("dialog", { name: "Requests" })).getByRole("alert").textContent).toBe(
      "This student's account isn't active."
    );
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
  });

  it("saves the enrollment chosen in the window", async () => {
    await open();
    await openEdit("Section-A");

    fireEvent.click(screen.getByRole("radio", { name: /Open/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });

    expect(updateClass.mock.calls[0][1]).toMatchObject({ enrollment: "open" });
  });
});
