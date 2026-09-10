import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { act, render, screen, fireEvent, within } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const COURSES = [{ id: "c1", code: "CC2", name: "Computer Programming 2" }];

const PAPERS = {
  lessons: [
    {
      moduleId: "m1",
      n: 1,
      title: "Creating Java Programs",
      assessment: { id: "a1", status: "posted" }
    },
    {
      moduleId: "m2",
      n: 2,
      title: "Using Data",
      assessment: { id: "a2", status: "draft" }
    },
    { moduleId: "m3", n: 3, title: "Using Methods", assessment: null }
  ],
  final: null
};

const ROWS = [
  {
    id: "st3",
    name: "Bautista, Miguel",
    sid: "202300003",
    status: "not-started",
    answered: null,
    itemCount: 5,
    score: null,
    totalPoints: 5,
    passMark: 3,
    passed: null,
    startedAt: null,
    submittedAt: null
  },
  {
    id: "st2",
    name: "Cruz, Ana",
    sid: "202300002",
    status: "in-progress",
    answered: null,
    itemCount: 5,
    score: null,
    totalPoints: 5,
    passMark: 3,
    passed: null,
    startedAt: "2026-09-04T07:13:00.000Z",
    submittedAt: null
  },
  {
    id: "st1",
    name: "Dayan, Chris Jerome",
    sid: "202300001",
    status: "submitted",
    answered: 5,
    itemCount: 5,
    score: 2,
    totalPoints: 5,
    passMark: 3,
    passed: false,
    startedAt: "2026-09-04T07:13:00.000Z",
    submittedAt: "2026-09-04T07:14:00.000Z"
  }
];

/** What comes back when one student's paper is opened off the register. */
const PAPER = {
  student: { id: "st1", name: "Dayan, Chris Jerome", sid: "202300001" },
  assessment: {
    id: "a1",
    title: "Creating Java Programs",
    scope: "lesson",
    itemCount: 2,
    totalPoints: 5,
    passMark: 3
  },
  result: {
    score: 2,
    totalPoints: 5,
    passMark: 3,
    passed: false,
    correct: 1,
    answered: 1,
    missing: 0,
    submittedAt: "2026-09-04T07:14:00.000Z",
    startedAt: "2026-09-04T07:13:00.000Z",
    durationMs: 60000
  },
  items: [
    {
      id: "i1",
      n: 1,
      type: "multiple-choice",
      q: "Which keyword declares a class?",
      choices: [
        { id: "a", text: "class" },
        { id: "b", text: "struct" }
      ],
      key: "a",
      chosen: "b",
      answered: true,
      verdict: "incorrect"
    },
    {
      id: "i2",
      n: 2,
      type: "multiple-choice",
      q: "Which method starts a Java program?",
      choices: [
        { id: "a", text: "main()" },
        { id: "b", text: "run()" }
      ],
      key: "a",
      chosen: null,
      answered: false,
      verdict: "incorrect"
    }
  ]
};

/** The register the read comes back with. A test may shorten it. */
let register = ROWS;

jest.unstable_mockModule("../src/services/assessors.js", () => ({
  storedAssessorId: () => "ASS001",
  fetchAssessorClasses: async () => COURSES,
  fetchCourseAssessments: async () => PAPERS,
  fetchStudentPaper: async () => PAPER,
  fetchAssessmentResults: async () => ({
    course: { id: "c1", code: "CC2", name: "Computer Programming 2" },
    assessment: {
      id: "a1",
      status: "posted",
      takers: { all: 3, notStarted: 1, inProgress: 1, submitted: 1 }
    },
    rows: register
  })
}));

beforeEach(() => {
  register = ROWS;
});

let ResultsPage, MemoryRouter;

beforeAll(async () => {
  ({ MemoryRouter } = await import("react-router-dom"));
  ({ default: ResultsPage } = await import("../src/pages/assessor/ResultsPage.jsx"));
});

/** Drawn and settled. `until` is a row the register is known to hold. */
const open = async (until = "Dayan, Chris Jerome") => {
  const view = render(
    <MemoryRouter>
      <ResultsPage />
    </MemoryRouter>
  );
  await screen.findByText(until);
  return view;
};

const rowFor = (name) => screen.getByText(name).closest("tr");

describe("the results table", () => {
  it("carries a column for everything the row is read by", async () => {
    await open();

    const table = await screen.findByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent.trim());

    expect(headers).toEqual([
      "Student #",
      "Student",
      "Answered",
      "Score",
      "Started",
      "Submitted",
      "Status",
      // Named for a screen reader only; the column carries the way out.
      "Open paper"
    ]);
  });

  /**
   * The register's order is the server's — it sorts the roll surname first,
   * alphabetically — and the screen's job is not to have an opinion about it.
   */
  it("keeps the rows in the order they were sent, surname first", async () => {
    await open();

    const names = screen
      .getAllByRole("rowheader")
      .map((cell) => cell.textContent.trim());

    expect(names).toEqual(["Bautista, Miguel", "Cruz, Ana", "Dayan, Chris Jerome"]);
  });

  it("says where each student has got to", async () => {
    await open();

    expect(within(rowFor("Bautista, Miguel")).getByText("Not started")).toBeInTheDocument();
    expect(within(rowFor("Cruz, Ana")).getByText("In progress")).toBeInTheDocument();
    expect(within(rowFor("Dayan, Chris Jerome")).getByText("Submitted")).toBeInTheDocument();
  });

  /**
   * A student working on a paper keeps their answers in their own browser
   * until they hand it in, so the server does not know how many they have
   * done. A dash says that; a nought would claim they had answered none.
   */
  it("dashes Answered for a student still working, rather than calling it nought", async () => {
    await open();

    const working = within(rowFor("Cruz, Ana"));
    expect(working.queryByText("0/5")).not.toBeInTheDocument();
    expect(working.getAllByText("—").length).toBeGreaterThan(0);

    expect(within(rowFor("Dayan, Chris Jerome")).getByText("5/5")).toBeInTheDocument();
  });

  it("marks a score under the pass mark without hiding it", async () => {
    const { container } = await open();

    const score = container.querySelector(".results-score");
    expect(score).toHaveTextContent("2/5");
    expect(score).toHaveClass("is-under");
  });

  it("shows the day over the time a paper was started and handed in", async () => {
    await open();

    const row = within(rowFor("Dayan, Chris Jerome"));
    expect(row.getAllByText("Sep 4, 2026")).toHaveLength(2);
  });
});

describe("finding one student in the list", () => {
  const search = () => screen.getByRole("searchbox", { name: "Search students" });
  const namesShown = () =>
    screen.getAllByRole("rowheader").map((cell) => cell.textContent.trim());

  it("narrows the table to the ones named", async () => {
    await open();

    await act(async () => {
      fireEvent.change(search(), { target: { value: "cruz" } });
    });

    expect(namesShown()).toEqual(["Cruz, Ana"]);
  });

  // The cell reads surname first, so the given name is no longer what it
  // starts with. Typing it must still find the person.
  it("finds a student by their given name, which is now the back half", async () => {
    await open();

    await act(async () => {
      fireEvent.change(search(), { target: { value: "ana" } });
    });

    expect(namesShown()).toEqual(["Cruz, Ana"]);
  });

  it("finds a student by their number as well as their name", async () => {
    await open();

    await act(async () => {
      fireEvent.change(search(), { target: { value: "202300003" } });
    });

    expect(namesShown()).toEqual(["Bautista, Miguel"]);
  });

  /**
   * The cards count the class, not the search. A "Not started" that fell to
   * nought because somebody typed a name would be answering a different
   * question from the one written under it.
   */
  it("leaves the counts above it alone", async () => {
    const { container } = await open();

    await act(async () => {
      fireEvent.change(search(), { target: { value: "ana" } });
    });

    const cards = [...container.querySelectorAll(".gen-taker")].map((card) =>
      card.textContent.trim()
    );
    expect(cards).toEqual([
      "3All students",
      "1Not started",
      "1In progress",
      "1Submitted"
    ]);
  });

  // Not the same as an empty course, and not the same as no paper chosen.
  it("says so when nobody matches, rather than reading as an empty course", async () => {
    await open();

    await act(async () => {
      fireEvent.change(search(), { target: { value: "zzz" } });
    });

    expect(
      screen.getByText("No student on this course matches that search.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/No students are enrolled/)).not.toBeInTheDocument();
  });
});

/**
 * The register is read looking for one state of it as often as for one person
 * — who has not started, who is still working — so the state is a control
 * beside the search rather than something to be found by eye down the last
 * column.
 */
describe("narrowing by state", () => {
  const search = () => screen.getByRole("searchbox", { name: "Search students" });

  // The listbox commits on mousedown, before the document's own listener can
  // close it — so a click alone opens the list and chooses nothing.
  const pick = async (label) => {
    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "Filter by status" }));
    });
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("option", { name: label }));
    });
  };

  const names = () =>
    [...document.querySelectorAll("tbody th[scope=row]")].map((cell) => cell.textContent);

  it("offers the three states the column carries, the whole class first", async () => {
    await open();

    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "Filter by status" }));
    });

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "All students",
      "Not started",
      "In progress",
      "Submitted"
    ]);
  });

  /**
   * Off, the control says what it does: a funnel and the word Filter. The row
   * that turns it back off says who the register will hold — "All students" —
   * which is a different job, and in the trigger would label the absence of a
   * filter beside a register already showing all of them.
   */
  it("reads as Filter until a state is picked", async () => {
    await open();

    const trigger = screen.getByRole("combobox", { name: "Filter by status" });
    expect(trigger.textContent).toBe("Filter");

    await pick("Submitted");
    expect(trigger.textContent).toBe("Submitted");

    await pick("All students");
    expect(trigger.textContent).toBe("Filter");
  });

  it("narrows the register to one state, and back to the class", async () => {
    await open();
    expect(names()).toHaveLength(3);

    await pick("Submitted");
    expect(names()).toEqual(["Dayan, Chris Jerome"]);

    await pick("In progress");
    expect(names()).toEqual(["Cruz, Ana"]);

    await pick("All students");
    expect(names()).toHaveLength(3);
  });

  it("narrows by state and by name at once", async () => {
    await open();

    await pick("Submitted");
    await act(async () => {
      fireEvent.change(search(), { target: { value: "dayan" } });
    });

    expect(names()).toEqual(["Dayan, Chris Jerome"]);
  });

  /**
   * A search inside a state has only searched that state, and saying the
   * student is not on the course would claim more than has been looked at —
   * they may be on it and standing in another state.
   */
  it("owns up to having searched one state, not the course", async () => {
    await open();

    await pick("Submitted");
    await act(async () => {
      fireEvent.change(search(), { target: { value: "cruz" } });
    });

    expect(screen.getByText("No student in that state matches that search.")).toBeInTheDocument();
    expect(
      screen.queryByText("No student on this course matches that search.")
    ).not.toBeInTheDocument();
  });

  it("says a state nobody is in is empty, rather than the course", async () => {
    register = ROWS.filter((row) => row.status !== "submitted");
    await open("Bautista, Miguel");

    await pick("Submitted");

    expect(screen.getByText("Nobody on this course is in that state.")).toBeInTheDocument();
    expect(screen.queryByText(/No students are enrolled/)).not.toBeInTheDocument();
  });
});

describe("opening one student's paper", () => {
  const openPaper = async (name) => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `Open ${name}'s paper` }));
    });
  };

  it("opens off the row of a student who has handed the paper in", async () => {
    await open();
    await openPaper("Dayan, Chris Jerome");

    expect(screen.getByText("Which keyword declares a class?")).toBeInTheDocument();
    expect(screen.getByText("2/5")).toBeInTheDocument();
  });

  /**
   * There is nothing to read of a student who has not taken it, and a name
   * that looked pressable but was not would be worse than one that plainly
   * is not.
   */
  it("leaves the names of students with nothing to show as plain text", async () => {
    await open();

    expect(
      screen.queryByRole("button", { name: "Open Bautista, Miguel's paper" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Cruz, Ana's paper" })
    ).not.toBeInTheDocument();
  });

  /**
   * The assessor writing the paper is the one reading it back, and the
   * question they are asking of a badly-answered item is whether the class
   * missed it or the question is wrong. They cannot ask that without the key.
   */
  it("shows the key beside what the student put down", async () => {
    const { container } = await open();
    await openPaper("Dayan, Chris Jerome");

    const [first] = container.querySelectorAll(".gen-q");
    const choices = [...first.querySelectorAll(".choice")];

    expect(choices[0]).toHaveTextContent("class");
    expect(choices[0]).toHaveTextContent("Correct answer");
    expect(choices[1]).toHaveTextContent("Their answer");
    expect(choices[1]).toHaveClass("is-wrong");
  });

  // Blank and wrong both score nothing, but only one of them says the student
  // ran out of time.
  it("says a question was left blank rather than showing no answer at all", async () => {
    const { container } = await open();
    await openPaper("Dayan, Chris Jerome");

    // On the question itself, in place of the answer that is not there.
    expect(container.querySelector(".choice--blank")).toHaveTextContent("Left blank");

    // And counted in the head, under the word for what it is.
    const facts = within(container.querySelector(".paper__facts"));
    expect(facts.getByText("Left blank")).toBeInTheDocument();
    expect(facts.getByText("1")).toBeInTheDocument();
  });

  /**
   * The head reads as labelled figures rather than a run of fragments: every
   * number sits under the word for what it is, so a reader looking for one
   * does not have to parse a sentence to find it.
   */
  it("labels every figure in the head of the paper", async () => {
    const { container } = await open();
    await openPaper("Dayan, Chris Jerome");

    const labels = [...container.querySelectorAll(".paper__facts .metric__label")].map((el) =>
      el.textContent
    );
    expect(labels).toEqual(["Score", "Correct", "Left blank", "Time taken", "Handed in"]);

    // The mark is coloured by whether it cleared the pass mark, and says what
    // it was measured against — 2/5 means nothing without the 3.
    expect(container.querySelector(".paper__mark")).toHaveClass("is-under");
    expect(within(container.querySelector(".paper__facts")).getByText("Pass mark 3"))
      .toBeInTheDocument();
  });

  /**
   * Coming back is the register as it was — the same paper, and the same
   * search — which is what makes reading three students in a row bearable.
   */
  it("comes back to the register with the search still on it", async () => {
    await open();

    await act(async () => {
      fireEvent.change(screen.getByRole("searchbox", { name: "Search students" }), {
        target: { value: "dayan" }
      });
    });
    await openPaper("Dayan, Chris Jerome");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Back to results/ }));
    });

    expect(screen.getByRole("searchbox", { name: "Search students" })).toHaveValue("dayan");
    expect(screen.getAllByRole("rowheader").map((cell) => cell.textContent.trim())).toEqual([
      "Dayan, Chris Jerome"
    ]);
  });
});

describe("choosing the paper", () => {
  it("opens on the first posted paper, since only those have results", async () => {
    await open();
    expect(screen.getByText("1. Creating Java Programs")).toBeInTheDocument();
  });

  /**
   * Every lesson is listed, not only the ones with a paper: an assessor
   * scanning for a lesson should find the lesson. What varies is whether it
   * can be opened, and the line above it says which of the three reasons.
   */
  it("lists every lesson, greying the ones with no results to show", async () => {
    const { container } = await open();

    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "Assessment" }));
    });

    const options = [...container.querySelectorAll(".assessor-select__option")];
    expect(options.map((option) => option.textContent)).toEqual([
      "Posted1. Creating Java Programs",
      "Written, not posted2. Using Data",
      "Not written3. Using Methods",
      "Not writtenFinal exam"
    ]);
  });
});
