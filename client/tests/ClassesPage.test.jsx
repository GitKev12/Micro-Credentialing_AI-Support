import { describe, it, expect, jest, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, within } from "@testing-library/react";

// jsdom ships without these; react-router reaches for them on import.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

jest.unstable_mockModule("../src/services/assessors.js", () => ({
  storedAssessorId: () => "ASS001",
  fetchAssessorClasses: async () => [
    {
      id: "c1",
      code: "IT 101",
      name: "Intro to Computing",
      section: "A",
      students: 4,
      lessons: 5,
      startsOn: "2026-08-04T00:00:00.000Z",
      endsOn: "2026-10-10T00:00:00.000Z",
      classes: [
        { id: "cl1", name: "IT01", active: true, students: 3 },
        { id: "cl2", name: "IT02", active: false, students: 1 }
      ],
      assessmentsExpected: 6,
      assessmentsWritten: 4,
      assessmentsPosted: 3,
      credentialsIssued: 2,
      credentialsPending: 1,
      lastSubmission: new Date().toISOString()
    },
    {
      id: "c2",
      code: "IT 202",
      name: "Data Structures",
      section: null,
      students: 2,
      lessons: 0,
      classes: [],
      assessmentsExpected: 1,
      assessmentsWritten: 0,
      assessmentsPosted: 0,
      credentialsIssued: 0,
      credentialsPending: 0,
      lastSubmission: null
    }
  ]
}));

let ClassesPage;
let MemoryRouter;

beforeAll(async () => {
  ({ MemoryRouter } = await import("react-router-dom"));
  ({ default: ClassesPage } = await import("../src/pages/assessor/ClassesPage.jsx"));
});

describe("ClassesPage", () => {
  it("renders the class register as a table", async () => {
    render(
      <MemoryRouter>
        <ClassesPage />
      </MemoryRouter>
    );

    const table = await screen.findByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent.trim());

    expect(headers).toEqual([
      "Course",
      "Students",
      "Lessons",
      "Duration",
      "Assessments",
      "Credentials",
      "Last activity",
      "Open class"
    ]);

    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Aug 4 – Oct 10, 2026")).toBeInTheDocument();
    expect(screen.getByText("10 weeks")).toBeInTheDocument();
    expect(screen.getByText("No submissions yet")).toBeInTheDocument();
    expect(screen.getByText("1 to approve")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(2);
    expect(screen.getByText("All classes")).toBeInTheDocument();
  });

  // The register now reports what has been released to each class rather than
  // what is waiting to be marked — posted out of one paper per lesson plus the
  // course's final.
  it("shows posted papers out of the papers each class is owed", async () => {
    render(
      <MemoryRouter>
        <ClassesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("3/6")).toBeInTheDocument();
    expect(screen.getByText("0/1")).toBeInTheDocument();
    // The footer adds the same column up.
    expect(screen.getByText("3/7")).toBeInTheDocument();
  });

  // The two tiles that used to sit above the register are gone. Both restated
  // a number already on screen twice over — the rail badges the same papers-to-
  // post count and links to the same screen, and the footer adds up the same
  // columns the tiles summarised.
  it("leaves the totals to the register rather than repeating them above it", async () => {
    const { container } = render(
      <MemoryRouter>
        <ClassesPage />
      </MemoryRouter>
    );

    await screen.findByText("Intro to Computing");
    expect(screen.queryByText("Assessments to Post")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve & Issue/ })).not.toBeInTheDocument();

    // What they said is still said, once, by the footer.
    const footer = within(container.querySelector("tfoot"));
    expect(footer.getByText("3/7")).toBeInTheDocument();
    expect(footer.getByText(/1 to approve/)).toBeInTheDocument();
  });
});

describe("the classes behind a course", () => {
  it("names them, so two do not read as one", async () => {
    // A course can be taught through more than one class. A single row saying
    // "4 students" gives no sign it is two classes, and an assessor cannot
    // tell which students they are looking at.
    render(
      <MemoryRouter>
        <ClassesPage />
      </MemoryRouter>
    );

    // The switched-off one is named as such: that is why its students are
    // missing from the count the assessor expected.
    expect(await screen.findByText("IT01 · IT02 (off)")).toBeInTheDocument();
  });

  it("says nothing at all for a course reached by enrolment alone", async () => {
    // Inventing a class name for a course that has none would be worse than
    // silence.
    const { container } = render(
      <MemoryRouter>
        <ClassesPage />
      </MemoryRouter>
    );

    await screen.findByText("Data Structures");
    const row = [...container.querySelectorAll("tbody tr")].find((tr) =>
      tr.textContent.includes("Data Structures")
    );
    expect(row.textContent).not.toMatch(/IT0/);
  });
});
