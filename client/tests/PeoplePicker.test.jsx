import { describe, it, expect, jest, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, fireEvent, within } from "@testing-library/react";

// jsdom ships without these; the page's imports reach for them.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

// Every name the screen imports from the real module, and nothing it does
// not export: a mock factory replaces the module wholesale, so one missing
// export fails the import rather than the assertion that needed it.
jest.unstable_mockModule("../src/services/classes.js", () => ({
  fetchClasses: async () => [],
  fetchClass: async () => null,
  fetchClassImpact: async () => ({}),
  createClass: async () => ({}),
  updateClass: async () => ({}),
  setClassActive: async () => ({}),
  deleteClass: async () => ({})
}));

jest.unstable_mockModule("../src/services/admin.js", () => ({
  fetchAssessors: async () => ({ assessors: [] }),
  fetchCourses: async () => [],
  fetchStudents: async () => []
}));

const COURSE = "c1";

const students = [
  { id: "s1", name: "Angela Reyes", studentNumber: "202300002", enrolled: [] },
  { id: "s2", name: "Mark Anthony Santos", studentNumber: "202300003", enrolled: [] },
  { id: "s3", name: "Nicole Fernandez", studentNumber: "202300004", enrolled: [] },
  {
    id: "s4",
    name: "Chris Jerome Dayan",
    studentNumber: "202300001",
    enrolled: [{ id: COURSE, code: "CC2", title: "Computer Programming 2" }]
  }
];

const assessors = [
  { id: "a1", name: "Patricia Mendoza", assessorNumber: "ASS002", assigned: [] },
  { id: "a2", name: "Daniel Cruz", assessorNumber: "ASS003", assigned: [] },
  {
    id: "a3",
    name: "Michael Torres",
    assessorNumber: "ASS001",
    assigned: [{ id: COURSE, code: "CC2", title: "Computer Programming 2" }]
  }
];

let PeoplePicker;

beforeAll(async () => {
  ({ PeoplePicker } = await import("../src/pages/admin/ClassesManagement.jsx"));
});

const open = (props = {}) => {
  const onApply = jest.fn();
  render(
    <PeoplePicker
      kind="student"
      people={students}
      courseId={COURSE}
      courseLabel="Computer Programming 2"
      selected={[]}
      onApply={onApply}
      onClose={() => {}}
      {...props}
    />
  );
  return { onApply };
};

/** The same panel, in its assessor vocabulary. */
const openAssessors = (props = {}) => {
  const onApply = jest.fn();
  render(
    <PeoplePicker
      kind="assessor"
      people={assessors}
      courseId={COURSE}
      courseLabel="Computer Programming 2"
      selected={[]}
      onApply={onApply}
      onClose={() => {}}
      {...props}
    />
  );
  return { onApply };
};

describe("PeoplePicker — students", () => {
  it("lists only the students not already in the course", () => {
    open();

    expect(screen.getByText("Not enrolled in this course (3)")).toBeInTheDocument();
    expect(screen.getByText("Angela Reyes")).toBeInTheDocument();
    // Already enrolled, so out of the main list until asked for.
    expect(screen.queryByText("Chris Jerome Dayan")).not.toBeInTheDocument();
  });

  it("counts the selection as it is made", () => {
    const { onApply } = open();

    const count = screen.getByRole("status");
    expect(count).toHaveTextContent("0 students selected");

    fireEvent.click(screen.getByText("Angela Reyes"));
    fireEvent.click(screen.getByText("Nicole Fernandez"));

    expect(count).toHaveTextContent("2 students selected");
    expect(screen.getByRole("button", { name: "Add 2 students" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add 2 students" }));
    expect(onApply).toHaveBeenCalledWith(["s1", "s3"]);
  });

  it("says one student, not 1 students", () => {
    open();
    fireEvent.click(screen.getByText("Angela Reyes"));

    expect(screen.getByRole("status")).toHaveTextContent("1 student selected");
    expect(screen.getByRole("button", { name: "Add 1 student" })).toBeInTheDocument();
  });

  it("keeps the already-enrolled reachable behind a toggle", () => {
    open();

    const toggle = screen.getByRole("button", { name: /Show the 1 already in this course/ });
    fireEvent.click(toggle);

    const row = screen.getByText("Chris Jerome Dayan").closest("label");
    expect(within(row).getByText(/already in this course/)).toBeInTheDocument();
  });

  it("opens with the students the class already has ticked", () => {
    open({ selected: ["s2"] });

    expect(screen.getByRole("status")).toHaveTextContent("1 student selected");
    expect(screen.getByText("Mark Anthony Santos").closest("label")).toHaveClass("is-picked");
  });

  it("filters by name and by student number", () => {
    open();

    const search = screen.getByLabelText("Search students");
    fireEvent.change(search, { target: { value: "nicole" } });
    expect(screen.getByText("Not enrolled in this course (1)")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "202300002" } });
    expect(screen.getByText("Angela Reyes")).toBeInTheDocument();
    expect(screen.queryByText("Nicole Fernandez")).not.toBeInTheDocument();
  });
});

describe("PeoplePicker — assessors", () => {
  it("lists only the assessors not already on the course", () => {
    openAssessors();

    expect(screen.getByText("Not assigned to this course (2)")).toBeInTheDocument();
    expect(screen.getByText("Patricia Mendoza")).toBeInTheDocument();
    expect(screen.queryByText("Michael Torres")).not.toBeInTheDocument();
  });

  it("counts in assessors, and hands back the ids", () => {
    const { onApply } = openAssessors();

    fireEvent.click(screen.getByText("Daniel Cruz"));
    expect(screen.getByRole("status")).toHaveTextContent("1 assessor selected");

    fireEvent.click(screen.getByText("Patricia Mendoza"));
    expect(screen.getByRole("status")).toHaveTextContent("2 assessors selected");

    fireEvent.click(screen.getByRole("button", { name: "Add 2 assessors" }));
    expect(onApply).toHaveBeenCalledWith(["a2", "a1"]);
  });

  it("says assessing, not enrolled, behind its toggle", () => {
    openAssessors();

    fireEvent.click(screen.getByRole("button", { name: /Show the 1 already assessing this course/ }));
    const row = screen.getByText("Michael Torres").closest("label");
    expect(within(row).getByText(/already assessing this course/)).toBeInTheDocument();
  });

  it("reads an assessor by their assessor number", () => {
    openAssessors();

    fireEvent.change(screen.getByLabelText("Search assessors"), { target: { value: "ASS003" } });
    expect(screen.getByText("Daniel Cruz")).toBeInTheDocument();
    expect(screen.queryByText("Patricia Mendoza")).not.toBeInTheDocument();
  });
});
