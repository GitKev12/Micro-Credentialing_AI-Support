import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { act, render, screen, fireEvent, within } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const COURSE = { id: "c1", code: "CC2", name: "Computer Programming 2", section: null };

const ROSTER = [
  {
    id: "st1",
    name: "Chris Jerome Dayan",
    sid: "202300001",
    classes: ["IT01 - CC2"],
    done: 3,
    creds: 1,
    suspended: false
  },
  {
    id: "st2",
    name: "Angela Reyes",
    sid: "202300002",
    classes: ["IT01 - CC2"],
    done: 1,
    creds: 0,
    suspended: true
  }
];

let suspensionCalls = [];
let suspensionFails = false;
let roster = [];

jest.unstable_mockModule("../src/services/assessors.js", () => ({
  storedAssessorId: () => "ASS001",
  fetchClassRoster: async () => ({
    course: COURSE,
    totalModules: 8,
    classes: [{ id: "k1", name: "IT01 - CC2", active: true, students: 2 }],
    roster
  }),
  setRosterStudentSuspended: async (assessorId, courseId, studentId, suspended) => {
    suspensionCalls.push({ assessorId, courseId, studentId, suspended });
    if (suspensionFails) {
      const error = new Error("refused");
      error.response = { data: { message: "You do not have access to this resource." } };
      throw error;
    }
    return { id: studentId, name: "Someone", suspended };
  }
}));

let RosterPage, MemoryRouter, Routes, Route;

beforeAll(async () => {
  ({ MemoryRouter, Routes, Route } = await import("react-router-dom"));
  ({ default: RosterPage } = await import("../src/pages/assessor/RosterPage.jsx"));
});

beforeEach(() => {
  suspensionCalls = [];
  suspensionFails = false;
  roster = ROSTER.map((row) => ({ ...row }));
});

const draw = async () => {
  const view = render(
    <MemoryRouter initialEntries={["/assessor/classes/c1"]}>
      <Routes>
        <Route path="/assessor/classes/:courseId" element={<RosterPage />} />
      </Routes>
    </MemoryRouter>
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
};

/**
 * A student's status switch, by the name a screen reader would announce: the
 * person, then the state written on the control.
 */
const switchFor = (name, state) => screen.getByRole("switch", { name: `${name} — ${state}` });

describe("roster status column", () => {
  it("no longer counts credentials waiting to be approved", async () => {
    // That is a queue, not a status, and the Credentials screen answers it.
    await draw();

    expect(screen.queryByText(/to approve/)).not.toBeInTheDocument();
    expect(screen.queryByText("Up to date")).not.toBeInTheDocument();
  });

  it("says whether each account can sign in", async () => {
    await draw();

    expect(switchFor("Chris Jerome Dayan", "Active")).toHaveAttribute("aria-checked", "true");
    expect(switchFor("Angela Reyes", "Suspended")).toHaveAttribute("aria-checked", "false");
  });

  it("names the course it closes, and says what it leaves alone", async () => {
    await draw();

    const title = switchFor("Chris Jerome Dayan", "Active").getAttribute("title");
    expect(title).toContain("Close CC2");
    // The other suspension in this system locks the account; this one must not
    // read as though it did.
    expect(title).toContain("other courses are not affected");
  });

  it("closes the switch for a student on the course with no class behind them", async () => {
    // The closure is recorded on the class, so there is nowhere to put it.
    roster = [{ ...ROSTER[0], classes: [] }];
    await draw();

    const control = switchFor("Chris Jerome Dayan", "Active");
    expect(control).toBeDisabled();
    expect(control.getAttribute("title")).toContain("without a class");
  });
});

describe("suspending from the roster", () => {
  it("writes the change and says what happened", async () => {
    await draw();

    await act(async () => {
      fireEvent.click(switchFor("Chris Jerome Dayan", "Active"));
    });

    expect(suspensionCalls).toEqual([
      { assessorId: "ASS001", courseId: "c1", studentId: "st1", suspended: true }
    ]);
    expect(screen.getByRole("status")).toHaveTextContent(
      "CC2 is closed for Chris Jerome Dayan. They keep their account and their other courses."
    );
    expect(switchFor("Chris Jerome Dayan", "Suspended")).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("lets a suspended student back in", async () => {
    await draw();

    await act(async () => {
      fireEvent.click(switchFor("Angela Reyes", "Suspended"));
    });

    expect(suspensionCalls[0].suspended).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent(
      "CC2 is open again for Angela Reyes."
    );
  });

  it("puts the switch back when the server refuses, and says why", async () => {
    suspensionFails = true;
    await draw();

    await act(async () => {
      fireEvent.click(switchFor("Chris Jerome Dayan", "Active"));
    });

    // Back where it was, rather than showing a change that did not happen.
    expect(switchFor("Chris Jerome Dayan", "Active")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "You do not have access to this resource."
    );
  });

  /**
   * The row opens the student and the switch stands a student down. One press
   * must never do both — which is the whole reason the row stopped being a
   * button when the switch went into it.
   */
  it("does not open the student when the switch is pressed", async () => {
    const { container } = await draw();

    await act(async () => {
      fireEvent.click(switchFor("Chris Jerome Dayan", "Active"));
    });

    // Still on the roster: the heading and both rows are where they were.
    expect(container.querySelectorAll(".assessor-table__row")).toHaveLength(2);
    expect(screen.getByText("Angela Reyes")).toBeInTheDocument();
  });

  it("keeps a way into the student for the keyboard", async () => {
    // The row's own click is the mouse's; this is the control a keyboard can
    // reach, and it must not be the switch.
    await draw();

    const open = screen.getByRole("button", { name: "Open Chris Jerome Dayan" });
    expect(open).toBeInTheDocument();
    expect(open).not.toHaveAttribute("role", "switch");
  });
});

/**
 * The roster is a table, the same one the class register is. It was a stack of
 * cards laid out on a grid, which read as five separate lists side by side —
 * and a row of a table is what a class list has always been.
 */
describe("the roster as a table", () => {
  it("carries a column for each thing the assessor decides on", async () => {
    await draw();

    const table = await screen.findByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent.trim());

    expect(headers).toEqual([
      "Student #",
      "Student",
      "Module progress",
      "Badges",
      "Status",
      "Open student"
    ]);
  });

  // The student is the row's own heading, so a screen reader reads every cell
  // back against the person it is about.
  it("makes the student the heading of their row", async () => {
    await draw();

    expect(
      screen.getByRole("rowheader", { name: /Chris Jerome Dayan/ })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("keeps the empty line inside the table rather than under it", async () => {
    roster = [];
    const { container } = await draw();

    const empty = container.querySelector(".assessor-table__empty");
    expect(empty).toHaveTextContent("No students are enrolled yet.");
    expect(empty.closest("table")).not.toBeNull();
    expect(empty).toHaveAttribute("colSpan", "6");
  });

  it("says the search came up empty, which is not the same as an empty class", async () => {
    await draw();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Search students"), {
        target: { value: "zzz" }
      });
    });

    expect(screen.getByText("No students match your search.")).toBeInTheDocument();
  });
});
