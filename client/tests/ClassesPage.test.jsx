import { describe, it, expect, jest, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, within } from "@testing-library/react";

// jsdom ships without these; react-router reaches for them on import.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

jest.unstable_mockModule("../src/services/assessors.js", () => ({
  storedAssessorId: () => "ASS001",
  fetchAssessorOverview: async () => ({
    summary: { toGrade: 3, aiFlagged: 1, credentials: 2 }
  }),
  fetchAssessorClasses: async () => [
    {
      id: "c1",
      code: "IT 101",
      name: "Intro to Computing",
      section: "A",
      students: 4,
      lessons: 5,
      pending: 3,
      flagged: 1,
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
      pending: 0,
      flagged: 0,
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
      "To grade",
      "AI flagged",
      "Credentials",
      "Last activity",
      "Open class"
    ]);

    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText("No submissions yet")).toBeInTheDocument();
    expect(screen.getByText("1 to approve")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(2);
    expect(screen.getByText("All classes")).toBeInTheDocument();
  });
});
