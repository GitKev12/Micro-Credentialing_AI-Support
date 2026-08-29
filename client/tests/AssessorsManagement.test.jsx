import { describe, it, expect, jest, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { act, render, screen, fireEvent, within } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const COURSE = "c1";

const assessors = [
  {
    id: "a1",
    name: "Michael Torres",
    assessorNumber: "ASS001",
    email: "mt@example.com",
    students: 12,
    suspended: false,
    assigned: [{ id: COURSE, code: "CC2", title: "Computer Programming 2" }],
    workload: {
      toGrade: 3,
      flagged: 1,
      released: 8,
      credentials: 2,
      oldestWaiting: new Date(Date.now() - 4 * 86400000).toISOString(),
      lastGraded: new Date(Date.now() - 86400000).toISOString()
    }
  },
  {
    id: "a2",
    name: "Patricia Mendoza",
    assessorNumber: "ASS002",
    email: "pm@example.com",
    students: 0,
    suspended: true,
    assigned: [],
    workload: {
      toGrade: 0,
      flagged: 0,
      released: 0,
      credentials: 0,
      oldestWaiting: null,
      lastGraded: null
    }
  }
];

jest.unstable_mockModule("../src/services/admin.js", () => ({
  MIN_PASSWORD_LENGTH: 8,
  fetchAssessors: async () => ({
    assessors,
    coverage: { unassigned: [], shared: [] }
  }),
  fetchAssessor: async () => ({
    ...assessors[0],
    classes: [
      {
        id: COURSE,
        code: "CC2",
        title: "Computer Programming 2",
        students: 12,
        toGrade: 3,
        flagged: 1,
        released: 8,
        credentials: 2,
        oldestWaiting: new Date(Date.now() - 4 * 86400000).toISOString()
      }
    ]
  }),
  fetchCourses: async () => [
    { id: COURSE, code: "CC2", title: "Computer Programming 2" },
    { id: "c2", code: "CC3", title: "Data Structures" }
  ],
  setAssessorSuspended: async () => ({}),
  updateAssessor: async () => ({})
}));

let AssessorsManagement;

beforeAll(async () => {
  AssessorsManagement = (await import("../src/pages/admin/AssessorsManagement.jsx")).default;
});

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe("AssessorsManagement — the students-list interface", () => {
  it("renders the category dropdown, the search field and the status switches", async () => {
    render(<AssessorsManagement />);
    await flush();

    expect(screen.getByLabelText("Filter assessors by category")).toBeTruthy();
    expect(screen.getByLabelText("Search assessors")).toBeTruthy();
    expect(screen.getByTitle("Suspend Michael Torres")).toBeTruthy();
    expect(screen.getByTitle("Activate Patricia Mendoza")).toBeTruthy();
  });

  it("narrows by category before searching", async () => {
    const { container } = render(<AssessorsManagement />);
    await flush();

    fireEvent.click(screen.getByLabelText("Filter assessors by category"));
    // The options select on mouseDown, not click.
    fireEvent.mouseDown(screen.getByText("Not assigned to any course"));

    const body = container.querySelector(".admin-table tbody");
    expect(within(body).queryByText("Michael Torres")).toBeNull();
    expect(within(body).getByText("Patricia Mendoza")).toBeTruthy();
  });

  it("shows the detail as one stats card over one table", async () => {
    const { container } = render(<AssessorsManagement />);
    await flush();

    fireEvent.click(screen.getAllByText("Michael Torres")[0]);
    await flush();

    expect(container.querySelector(".admin-detail-stack")).toBeTruthy();
    expect(container.querySelector(".admin-stats--compact")).toBeTruthy();
    expect(container.querySelector(".admin-table-head")).toBeTruthy();
    expect(container.querySelectorAll(".admin-grid-2").length).toBe(0);
    expect(screen.getByText("Oldest waiting 4 days")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
  });
});
