import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { act, render, screen, fireEvent, within } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const COURSE = "c1";

const days = (count) => new Date(Date.now() - count * 86400000).toISOString();

const assessors = [
  {
    id: "a1",
    name: "Michael Torres",
    assessorNumber: "ASS001",
    email: "mt@example.com",
    students: 12,
    suspended: false,
    assigned: [{ id: COURSE, code: "CC2", title: "Computer Programming 2" }],
    // Nine papers owed on an eight-lesson course, six of them out.
    workload: {
      papersExpected: 9,
      papersPosted: 6,
      papersDraft: 2,
      toPost: 3,
      credentialsPending: 2,
      credentialsIssued: 4
    },
    lastActive: { at: days(1), kind: "posted" }
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
      papersExpected: 0,
      papersPosted: 0,
      papersDraft: 0,
      toPost: 0,
      credentialsPending: 0,
      credentialsIssued: 0
    },
    lastActive: { at: null, kind: null }
  }
];

const coverage = { unassigned: [], shared: [], unposted: [] };

/** The assessor the detail screen loads unless a test overrides `detail`. */
const defaultDetail = () => ({
  ...assessors[0],
  classes: [
    {
      id: COURSE,
      code: "CC2",
      title: "Computer Programming 2",
      students: 12,
      // Nobody else is on this course, so its figures are this assessor's own.
      sharedWith: 0,
      papersExpected: 9,
      papersPosted: 6,
      papersDraft: 2,
      toPost: 3,
      credentialsPending: 2,
      credentialsIssued: 4
    }
  ]
});

// Set by a test that needs a different assessor under the detail screen, and
// cleared before each one so the list fixtures above stay the default.
let detail = null;

jest.unstable_mockModule("../src/services/admin.js", () => ({
  MIN_PASSWORD_LENGTH: 8,
  // A fresh array each call, as the real API gives: returning the same
  // reference would let React skip the re-render and hide a real change.
  fetchAssessors: async () => ({ assessors: [...assessors], coverage }),
  fetchAssessor: async () => detail ?? defaultDetail(),
  fetchCourses: async () => [
    { id: COURSE, code: "CC2", title: "Computer Programming 2" },
    { id: "c2", code: "CC3", title: "Data Structures" }
  ],
  setAssessorSuspended: async () => ({}),
  updateAssessor: async () => ({}),
  createAssessor: async (details) => {
    // The server sorts by name, so the fake API inserts in that order too.
    const made = { ...assessors[0], id: "a3", name: details.name, assigned: [] };
    assessors.splice(0, 0, made);
    assessors.sort((a, b) => a.name.localeCompare(b.name));
    return made;
  },
  fetchAssessorImpact: async () => ({ classes: 0, assigned: 0, graded: 0 }),
  deleteAssessor: async () => ({ assessor: { id: "a1", name: "Michael Torres" } })
}));

let AssessorsManagement;

beforeAll(async () => {
  AssessorsManagement = (await import("../src/pages/admin/AssessorsManagement.jsx")).default;
});

beforeEach(() => {
  detail = null;
});

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

/** Opens the first assessor's detail screen. */
const openDetail = async () => {
  const view = render(<AssessorsManagement />);
  await flush();
  fireEvent.click(screen.getAllByText("Michael Torres")[0]);
  await flush();
  return view;
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

  it("leads the row with the papers still to post, against what the course owes", async () => {
    const { container } = render(<AssessorsManagement />);
    await flush();

    const row = within(container.querySelector(".admin-table tbody")).getByText(
      "Michael Torres"
    ).closest("tr");

    expect(row.querySelector(".admin-count--warn").textContent).toBe("3");
    expect(within(row).getByText("of 9")).toBeTruthy();
    // An assessor holding no course owes nothing, which is not the same answer
    // as being up to date on everything they hold.
    const idle = within(container.querySelector(".admin-table tbody")).getByText(
      "Patricia Mendoza"
    ).closest("tr");
    expect(within(idle).queryByText("All posted")).toBeNull();
  });

  it("names whichever kind of work the assessor did last", async () => {
    render(<AssessorsManagement />);
    await flush();

    expect(screen.getByText("posted an assessment")).toBeTruthy();
    expect(screen.getByText("Never")).toBeTruthy();
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
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("opens on the papers the assessor owes, and on the credentials they owe", async () => {
    render(<AssessorsManagement />);
    await flush();

    fireEvent.click(screen.getAllByText("Michael Torres")[0]);
    await flush();

    expect(screen.getByText("Assessments to post")).toBeTruthy();
    expect(screen.getByText("6 of 9 posted · 2 drafts written")).toBeTruthy();
    expect(screen.getByText("Credentials to issue")).toBeTruthy();
    expect(screen.getByText("4 issued so far")).toBeTruthy();
    // Posting, not grading, was the last thing they did.
    expect(screen.getByText(/^Last posted /)).toBeTruthy();
    // Nothing about marking is reported: the console has no grading section to
    // work a backlog from, and a running total of grades put out only ever grew.
    expect(screen.queryByText("Needs a decision")).toBeNull();
    expect(screen.queryByText("To grade")).toBeNull();
    expect(screen.queryByText("Grades released")).toBeNull();
  });

  it("breaks the papers down per course, posted against owed", async () => {
    const { container } = render(<AssessorsManagement />);
    await flush();

    fireEvent.click(screen.getAllByText("Michael Torres")[0]);
    await flush();

    const row = container.querySelector(".admin-table__static");
    expect(within(row).getByText("6 / 9")).toBeTruthy();
    expect(within(row).getByText("2 drafts")).toBeTruthy();
  });

  // Every figure on a course row is the course's, not the person's: two
  // assessors on one course are handed the same posted and credential counts,
  // so "6 / 9" on a shared course is the course's progress rather than this
  // assessor's six. The row has to say so or it reads as their own output.
  it("marks a course another assessor is also on", async () => {
    detail = {
      ...defaultDetail(),
      classes: [{ ...defaultDetail().classes[0], sharedWith: 1 }]
    };

    const { container } = await openDetail();

    const row = container.querySelector(".admin-table__static");
    expect(within(row).getByText("Shared with 1 other assessor")).toBeTruthy();
  });

  it("counts the others, and says nothing on a course this assessor has alone", async () => {
    detail = {
      ...defaultDetail(),
      classes: [{ ...defaultDetail().classes[0], sharedWith: 2 }]
    };

    const shared = await openDetail();
    expect(
      within(shared.container.querySelector(".admin-table__static")).getByText(
        "Shared with 2 other assessors"
      )
    ).toBeTruthy();

    shared.unmount();
    detail = null;

    const { container } = await openDetail();
    expect(within(container.querySelector(".admin-table__static")).queryByText(/^Shared with/))
      .toBeNull();
  });
});

// The pill says the account is locked and the tiles say what it owes; joined,
// they say the work is not late but stopped.
describe("AssessorsManagement — a suspended assessor's outstanding work", () => {
  it("names what the suspension has stopped", async () => {
    detail = { ...defaultDetail(), suspended: true };

    const { container } = await openDetail();

    const notice = container.querySelector(".admin-notice--warn");
    expect(notice).toBeTruthy();
    expect(notice.textContent).toContain("Suspended with work outstanding");
    expect(notice.textContent).toContain("3 assessments to post and 2 credentials to issue");
  });

  it("drops the half of the sentence that is zero", async () => {
    detail = {
      ...defaultDetail(),
      suspended: true,
      workload: { ...assessors[0].workload, credentialsPending: 0 }
    };

    const { container } = await openDetail();

    const notice = container.querySelector(".admin-notice--warn");
    expect(notice.textContent).toContain("3 assessments to post.");
    expect(notice.textContent).not.toContain("credential");
  });

  it("says nothing when the suspended account owes nothing", async () => {
    detail = {
      ...defaultDetail(),
      suspended: true,
      workload: { ...assessors[0].workload, toPost: 0, credentialsPending: 0 }
    };

    const { container } = await openDetail();
    expect(container.querySelector(".admin-notice--warn")).toBeNull();
  });

  it("says nothing about an active account carrying the same work", async () => {
    const { container } = await openDetail();
    expect(container.querySelector(".admin-notice--warn")).toBeNull();
  });
});

describe("AssessorsManagement — how stale the last activity is", () => {
  it("carries the age beside the date, which is the question a date does not answer", async () => {
    detail = { ...defaultDetail(), lastActive: { at: days(16), kind: "posted" } };

    await openDetail();

    expect(screen.getByText(/^Last posted .+ · 2 weeks ago$/)).toBeTruthy();
  });

  it("leaves an account that has never worked saying so", async () => {
    detail = { ...defaultDetail(), lastActive: { at: null, kind: null } };

    await openDetail();

    expect(screen.getByText("Has not posted or graded anything yet")).toBeTruthy();
  });
});

// The create handler existed before the control that reaches it did, and the
// build was perfectly happy about that: a feature with no way in still
// compiles. This asserts the way in, not just the machinery behind it.
describe("AssessorsManagement — adding and removing accounts", () => {
  it("offers New assessor from the toolbar", async () => {
    render(<AssessorsManagement />);
    await flush();

    expect(screen.getByRole("button", { name: "New assessor" })).toBeTruthy();
  });

  it("opens the form blank, as a create form", async () => {
    render(<AssessorsManagement />);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "New assessor" }));

    expect(screen.getByRole("heading", { name: "New assessor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create assessor" })).toBeTruthy();
  });

  it("offers Delete on the detail screen, and asks before doing it", async () => {
    await openDetail();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await flush();

    expect(screen.getByRole("heading", { name: "Delete this assessor?" })).toBeTruthy();
    // What survives is the half worth saying out loud.
    expect(screen.getByRole("button", { name: "Delete assessor" })).toBeTruthy();
  });
});

describe("AssessorsManagement — a new account lands in order", () => {
  it("puts it where the server would, not at the bottom", async () => {
    const { container } = render(<AssessorsManagement />);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "New assessor" }));
    fireEvent.change(screen.getByLabelText(/Full name|Name/), {
      target: { value: "Aaron Bautista" }
    });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "ab@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: "Create assessor" }));
    await flush();

    const names = [...container.querySelectorAll(".admin-person__name")].map((n) => n.textContent);
    // Alphabetically first, so it must not be sitting at the end of the list.
    expect(names[0]).toBe("Aaron Bautista");

    // Leave the fixture as the other tests expect to find it.
    const made = assessors.findIndex((a) => a.id === "a3");
    if (made >= 0) assessors.splice(made, 1);
  });

  // The receipt rides the search row rather than sitting above the table,
  // where it shunted the whole list down and back as it came and went.
  it("reports the write from inside the search row", async () => {
    const { container } = render(<AssessorsManagement />);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "New assessor" }));
    fireEvent.change(screen.getByLabelText(/Full name|Name/), {
      target: { value: "Aaron Bautista" }
    });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "ab@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: "Create assessor" }));
    await flush();

    const notice = container.querySelector(".admin-notice--inline");
    expect(notice.textContent).toContain("Aaron Bautista was added.");
    expect(notice.closest(".admin-search")).toBeTruthy();

    const made = assessors.findIndex((a) => a.id === "a3");
    if (made >= 0) assessors.splice(made, 1);
  });
});
