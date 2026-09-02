import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { act, render, screen, fireEvent, within } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const COURSES = [
  { id: "c1", code: "CC2", title: "Computer Programming 2" },
  { id: "c2", code: "CC3", title: "Data Structures" },
  // A course nobody has scheduled a class on yet.
  { id: "c3", code: "CC4", title: "Discrete Mathematics" }
];

const course = (id) => {
  const found = COURSES.find((row) => row.id === id);
  return { id: found.id, code: found.code, title: found.title };
};

let classes = [];

const defaultClasses = () => [
  {
    id: "k1",
    name: "CC2 — Section A",
    course: course("c1"),
    assessors: [{ id: "a1", name: "Michael Torres" }],
    studentCount: 12,
    schedule: null,
    active: true
  },
  {
    id: "k2",
    name: "CC2 — Section B",
    course: course("c1"),
    assessors: [{ id: "a2", name: "Patricia Mendoza" }],
    studentCount: 9,
    schedule: null,
    active: false
  },
  {
    id: "k3",
    name: "CC3 — Section A",
    course: course("c2"),
    assessors: [],
    studentCount: 4,
    schedule: null,
    active: true
  },
  // Written before its course was chosen, which the form allows.
  {
    id: "k4",
    name: "Unassigned pilot",
    course: null,
    assessors: [],
    studentCount: 0,
    schedule: null,
    active: false
  }
];

jest.unstable_mockModule("../src/services/classes.js", () => ({
  fetchClasses: async () => [...classes],
  fetchClass: async (id) => classes.find((row) => row.id === id),
  fetchClassImpact: async () => ({ unenroll: 0, unassign: 0 }),
  createClass: async () => ({ name: "New class" }),
  updateClass: async () => ({ name: "Saved" }),
  deleteClass: async () => ({ name: "Gone" }),
  setClassActive: async () => ({})
}));

// The staff the classes above name, so the assessor field has something to
// offer besides "no assessor".
const ASSESSORS = [
  { id: "a1", name: "Michael Torres" },
  { id: "a2", name: "Patricia Mendoza" },
  // On nobody's class, and still listed: that is the answer to "what has this
  // one been given?"
  { id: "a3", name: "Rosa Delgado" }
];

jest.unstable_mockModule("../src/services/admin.js", () => ({
  MIN_PASSWORD_LENGTH: 8,
  fetchCourses: async () => COURSES,
  fetchStudents: async () => [],
  fetchAssessors: async () => ({ assessors: ASSESSORS, coverage: {} })
}));

let ClassesManagement;

beforeAll(async () => {
  ClassesManagement = (await import("../src/pages/admin/ClassesManagement.jsx")).default;
});

beforeEach(() => {
  classes = defaultClasses();
});

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const open = async () => {
  const view = render(<ClassesManagement />);
  await flush();
  return view;
};

/**
 * The filter is two listboxes, not a <select>: the left picks what to filter
 * on, the right picks which one. `on` names the field when it is not the
 * course the screen opens on.
 */
const filterBy = (label, on = "course") => {
  if (on !== "course") {
    fireEvent.click(screen.getByLabelText("Choose what to filter classes by"));
    fireEvent.mouseDown(screen.getByRole("option", { name: new RegExp(`^${on}$`, "i") }));
  }

  fireEvent.click(screen.getByLabelText(`Filter classes by ${on}`));
  // onMouseDown, not click: the option commits on mousedown so the document
  // listener that closes the list cannot swallow it first.
  fireEvent.mouseDown(screen.getByRole("option", { name: new RegExp(label) }));
};

const names = (container) =>
  [...container.querySelectorAll("tbody tr:not(.admin-table__empty)")].map(
    (row) => row.querySelector(".admin-person__name").textContent
  );

describe("ClassesManagement — the course filter", () => {
  it("offers every course, plus all classes and the ones tied to none", async () => {
    await open();

    fireEvent.click(screen.getByLabelText("Filter classes by course"));

    const read = (selector) =>
      [...document.querySelectorAll(`.admin-select__option ${selector}`)].map(
        (node) => node.textContent
      );

    expect(read(".admin-select__option-label")).toEqual([
      "All classes",
      "Computer Programming 2",
      "Data Structures",
      // Listed at nought rather than dropped: that it has no class is the
      // answer to a question this screen is opened with.
      "Discrete Mathematics",
      "Not tied to any course"
    ]);
    expect(read(".admin-select__option-meta")).toEqual(["4", "CC2 · 2", "CC3 · 1", "CC4 · 0", "1"]);
  });

  it("opens on every class", async () => {
    const { container } = await open();

    expect(names(container)).toEqual([
      "CC2 — Section A",
      "CC2 — Section B",
      "CC3 — Section A",
      "Unassigned pilot"
    ]);
  });

  it("narrows the table to the chosen course", async () => {
    const { container } = await open();

    filterBy("Computer Programming 2");

    expect(names(container)).toEqual(["CC2 — Section A", "CC2 — Section B"]);
  });

  // The hint rides the search field and only appears once something is typed
  // — the same rule the students and assessors lists have always had — so it
  // reports the course and the term together rather than the term alone.
  it("counts what the course and the search leave, against the whole list", async () => {
    await open();

    const search = screen.getByLabelText("Search classes");
    fireEvent.change(search, { target: { value: "Section" } });
    expect(screen.getByText("3 of 4")).toBeTruthy();

    filterBy("Computer Programming 2");
    expect(screen.getByText("2 of 4")).toBeTruthy();
  });

  it("gathers the classes written before a course was chosen", async () => {
    const { container } = await open();

    filterBy("Not tied to any course");

    expect(names(container)).toEqual(["Unassigned pilot"]);
  });

  // The course narrows first, so typing searches what is on screen rather
  // than the whole list.
  it("searches within the chosen course, not across all of them", async () => {
    const { container } = await open();

    filterBy("Computer Programming 2");
    fireEvent.change(screen.getByLabelText("Search classes"), {
      target: { value: "Section A" }
    });

    expect(names(container)).toEqual(["CC2 — Section A"]);

    // "CC3 — Section A" matches the term and is left out on the course alone.
    expect(screen.queryByText("CC3 — Section A")).toBeNull();
  });

  it("offers a choice of what to filter on, not only which course", async () => {
    await open();

    fireEvent.click(screen.getByLabelText("Choose what to filter classes by"));

    expect(screen.getAllByRole("option").map((row) => row.textContent)).toEqual([
      "Course",
      "Status",
      "Assessor"
    ]);
  });

  it("narrows to the classes that are running", async () => {
    const { container } = await open();

    filterBy("Active", "status");

    expect(names(container)).toEqual(["CC2 — Section A", "CC3 — Section A"]);
  });

  it("narrows to one assessor's classes, and to the ones nobody has", async () => {
    const { container } = await open();

    filterBy("Michael Torres", "assessor");
    expect(names(container)).toEqual(["CC2 — Section A"]);

    filterBy("No assessor", "assessor");
    expect(names(container)).toEqual(["CC3 — Section A", "Unassigned pilot"]);
  });

  it("drops the chosen value when the field it belonged to changes", async () => {
    const { container } = await open();

    filterBy("Data Structures");
    expect(names(container)).toEqual(["CC3 — Section A"]);

    // Choosing the field alone, with no value after it.
    fireEvent.click(screen.getByLabelText("Choose what to filter classes by"));
    fireEvent.mouseDown(screen.getByRole("option", { name: /^Status$/i }));

    expect(names(container)).toEqual([
      "CC2 — Section A",
      "CC2 — Section B",
      "CC3 — Section A",
      "Unassigned pilot"
    ]);
  });

  it("says a course has no class rather than that the console has none", async () => {
    const { container } = await open();

    filterBy("Discrete Mathematics");

    expect(names(container)).toEqual([]);
    expect(
      within(container.querySelector(".admin-table__empty")).getByText("No class on this course yet.")
    ).toBeTruthy();
  });

  it("tells a missed search apart from a filtered-to-nothing table", async () => {
    const { container } = await open();

    fireEvent.change(screen.getByLabelText("Search classes"), {
      target: { value: "zzz" }
    });

    expect(
      within(container.querySelector(".admin-table__empty")).getByText("No classes match your search.")
    ).toBeTruthy();
  });

  it("says so when every class is tied to a course", async () => {
    classes = defaultClasses().filter((row) => row.course);
    const { container } = await open();

    filterBy("Not tied to any course");

    expect(
      within(container.querySelector(".admin-table__empty")).getByText(
        "Every class is tied to a course."
      )
    ).toBeTruthy();
  });

  it("keeps the first-run line for a console with no class at all", async () => {
    classes = [];
    const { container } = await open();

    expect(
      within(container.querySelector(".admin-table__empty")).getByText(/No classes yet\./)
    ).toBeTruthy();
  });
});
