import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const ROWS = [
  {
    id: "r1",
    studentId: "st1",
    name: "Nicole Fernandez",
    sid: "202300417",
    credential: "Computer Programming 2 Credential",
    courseId: "c1",
    courseCode: "CC2",
    assessmentTitle: "Computer Programming 2 — Final Exam",
    score: 42,
    totalPoints: 50,
    passMark: 30
  },
  {
    id: "r2",
    studentId: "st2",
    name: "Miguel Bautista",
    sid: "202300218",
    credential: "Computer Programming 2 Credential",
    courseId: "c1",
    courseCode: "CC2",
    assessmentTitle: "Computer Programming 2 — Final Exam",
    score: 31,
    totalPoints: 50,
    passMark: 30
  }
];

/** A row off another course, for the picker to tell apart from the CC2 pair. */
const OTHER = {
  id: "r3",
  studentId: "st3",
  name: "Ana Reyes",
  sid: "202300999",
  credential: "Data Structures Credential",
  courseId: "c2",
  courseCode: "DS1",
  assessmentTitle: "Data Structures — Final Exam",
  score: 40,
  totalPoints: 50,
  passMark: 30
};

const CLASSES = [
  { id: "c1", code: "CC2", name: "Computer Programming 2" },
  { id: "c2", code: "DS1", name: "Data Structures" }
];

let issueFails = false;
let issueCalls = [];
let pending = [];
let classes = [];

jest.unstable_mockModule("../src/services/assessors.js", () => ({
  storedAssessorId: () => "ASS001",
  fetchAssessorClasses: async () => classes,
  fetchPendingCredentials: async () => pending,
  issueCredential: async (assessorId, submissionId) => {
    issueCalls.push({ assessorId, submissionId });
    if (issueFails) throw new Error("refused");
    return { credential: { status: "issued" } };
  }
}));

let CredentialsPage, MemoryRouter;

beforeAll(async () => {
  ({ MemoryRouter } = await import("react-router-dom"));
  ({ default: CredentialsPage } = await import("../src/pages/assessor/CredentialsPage.jsx"));
});

beforeEach(() => {
  issueFails = false;
  issueCalls = [];
  pending = ROWS.map((row) => ({ ...row }));
  classes = CLASSES.map((course) => ({ ...course }));
});

const open = async () => {
  const { container } = render(
    <MemoryRouter>
      <CredentialsPage />
    </MemoryRouter>
  );
  await screen.findByText("Nicole Fernandez");
  return container;
};

const issueButtons = () => screen.getAllByRole("button", { name: "Issue credential" });

// Asked for by class rather than by role: the released row is itself a
// role="status" ("Issued today"), so a role query cannot tell the receipt
// from a message about it.
const noticeIn = (container) => container.querySelector(".assessor-notice");

describe("releasing a credential", () => {
  it("turns the row into the receipt, and says nothing on top of it", async () => {
    const container = await open();

    await act(async () => {
      fireEvent.click(issueButtons()[0]);
    });

    expect(issueCalls).toEqual([{ assessorId: "ASS001", submissionId: "r1" }]);
    expect(await screen.findByText("Issued today")).toBeInTheDocument();

    // The row already reports what happened. A message repeating it would only
    // be one more thing to read.
    expect(noticeIn(container)).toBeNull();

    // The other row is untouched.
    expect(issueButtons()).toHaveLength(1);
  });

  /**
   * The failure used to be swallowed whole: the button was left as it was so
   * the release could be retried, and nothing else happened. From the
   * assessor's side that is a button that does nothing — there is no telling a
   * refusal from a slow network, so the press gets repeated.
   */
  it("says so when the release is refused, and names who it was for", async () => {
    issueFails = true;
    await open();

    await act(async () => {
      fireEvent.click(issueButtons()[0]);
    });

    expect(
      await screen.findByText("Couldn't issue Nicole Fernandez's credential. Try again.")
    ).toBeInTheDocument();

    // Still offered, because the release can be tried again.
    expect(issueButtons()).toHaveLength(2);
    expect(screen.queryByText("Issued today")).not.toBeInTheDocument();
  });

  it("clears a standing failure once the retry lands", async () => {
    issueFails = true;
    const container = await open();

    await act(async () => {
      fireEvent.click(issueButtons()[0]);
    });
    await screen.findByText(/Couldn't issue/);

    issueFails = false;
    await act(async () => {
      fireEvent.click(issueButtons()[0]);
    });

    await waitFor(() => expect(noticeIn(container)).toBeNull());
    expect(await screen.findByText("Issued today")).toBeInTheDocument();
  });

  // Two students can fail in a row, and the second message has to be about the
  // second student rather than the first one still standing there.
  it("names the student the last failure was about", async () => {
    issueFails = true;
    await open();

    await act(async () => {
      fireEvent.click(issueButtons()[1]);
    });

    expect(
      await screen.findByText("Couldn't issue Miguel Bautista's credential. Try again.")
    ).toBeInTheDocument();
  });
});

describe("the count above the list", () => {
  it("drops as each one is released", async () => {
    await open();
    expect(screen.getByText("2 awaiting release")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(issueButtons()[0]);
    });

    expect(await screen.findByText("1 awaiting release")).toBeInTheDocument();
  });
});

/**
 * The same table the class register and the roster are. It was a stack of
 * cards on a grid, which is five lists standing side by side rather than one
 * list of people — and what an assessor does here is compare rows.
 */
describe("the credentials list as a table", () => {
  it("carries a column for each thing the release is judged on", async () => {
    await open();

    const table = await screen.findByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent.trim());

    expect(headers).toEqual([
      "Student #",
      "Student",
      "Credential",
      "Score",
      "Result",
      "Release"
    ]);
  });

  // The student is the row's own heading, so a screen reader reads the score
  // and the mark back against the person they belong to.
  it("makes the student the heading of their row", async () => {
    await open();

    expect(
      screen.getByRole("rowheader", { name: /Nicole Fernandez/ })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("keeps the score and the mark it was passed against on the same row", async () => {
    await open();

    expect(screen.getByText("42/50")).toBeInTheDocument();
    expect(screen.getAllByText(/Passed · 30 to pass/)).toHaveLength(2);
  });

  it("keeps the empty line inside the table rather than under it", async () => {
    pending = [];
    render(
      <MemoryRouter>
        <CredentialsPage />
      </MemoryRouter>
    );

    const empty = await screen.findByText("No credentials are waiting for release.");
    expect(empty.closest("table")).not.toBeNull();
    expect(empty).toHaveAttribute("colSpan", "6");
  });
});

/**
 * The queue stands across every course an assessor teaches, and it is read
 * looking for one course's worth of it or for one student. Both narrow the
 * list already in hand rather than asking for it again: every pending
 * credential arrived in the one read the screen makes.
 */
describe("narrowing the queue", () => {
  // The listbox commits on mousedown, before the document's own listener can
  // close it — so a click alone opens the list and chooses nothing.
  const pick = async (label) => {
    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "Course" }));
    });
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("option", { name: new RegExp(label) }));
    });
  };

  const type = async (term) => {
    await act(async () => {
      fireEvent.change(screen.getByRole("searchbox", { name: "Search students" }), {
        target: { value: term }
      });
    });
  };

  const names = (container) =>
    [...container.querySelectorAll("tbody th[scope=row]")].map((cell) => cell.textContent);

  it("offers the assessor's own courses, the whole queue first", async () => {
    await open();

    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "Course" }));
    });

    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options[0]).toContain("All courses");
    expect(options.join(" ")).toContain("Computer Programming 2");
    expect(options.join(" ")).toContain("Data Structures");
  });

  it("narrows the queue to one course, and back to all of it", async () => {
    pending = [...ROWS.map((row) => ({ ...row })), { ...OTHER }];
    const container = await open();
    expect(names(container)).toHaveLength(3);

    await pick("Data Structures");
    expect(names(container)).toEqual(["Ana Reyes"]);

    await pick("All courses");
    expect(names(container)).toHaveLength(3);
  });

  it("finds a student by name and by number", async () => {
    const container = await open();

    await type("bautista");
    expect(names(container)).toEqual(["Miguel Bautista"]);

    await type("202300417");
    expect(names(container)).toEqual(["Nicole Fernandez"]);
  });

  /**
   * An empty queue and a queue narrowed to nothing are different answers.
   * Telling an assessor there is no work waiting when they have only mistyped
   * a name would be the wrong one.
   */
  it("says nothing matched, rather than that nothing is waiting", async () => {
    await open();

    await type("nobody");
    expect(screen.getByText("No student in the queue matches that search.")).toBeInTheDocument();
    expect(
      screen.queryByText("No credentials are waiting for release.")
    ).not.toBeInTheDocument();
  });

  /**
   * A search and a course narrow the list together, so a search that finds
   * nothing while a course is picked has only searched that course. Saying the
   * student is not in the queue would claim more than has been looked at —
   * they may be standing on another course.
   */
  it("owns up to having searched one course, not the queue", async () => {
    pending = [...ROWS.map((row) => ({ ...row })), { ...OTHER }];
    await open();

    await pick("Data Structures");
    await type("bautista");

    expect(
      screen.getByText("No student on this course matches that search.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No student in the queue matches that search.")
    ).not.toBeInTheDocument();
  });

  it("says which course is empty when a course is the thing narrowing it", async () => {
    pending = ROWS.map((row) => ({ ...row }));
    await open();

    await pick("Data Structures");
    expect(
      screen.getByText("No credentials are waiting for release on this course.")
    ).toBeInTheDocument();
  });

  /**
   * The count in the header is the queue's own: it says how much work is
   * standing, which is not a question about what is on screen.
   */
  it("leaves the count above the list alone", async () => {
    await open();

    await type("bautista");
    expect(screen.getByText("2 awaiting release")).toBeInTheDocument();
  });
});
