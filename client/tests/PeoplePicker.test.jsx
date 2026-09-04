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
const CC2 = { id: COURSE, code: "CC2", title: "Computer Programming 2" };

const students = [
  { id: "s1", name: "Angela Reyes", studentNumber: "202300002", enrolled: [] },
  { id: "s2", name: "Mark Anthony Santos", studentNumber: "202300003", enrolled: [] },
  { id: "s3", name: "Nicole Fernandez", studentNumber: "202300004", enrolled: [] },
  // Already in a section of CC2, so no other section may take them.
  { id: "s4", name: "Chris Jerome Dayan", studentNumber: "202300001", enrolled: [CC2] }
];

let PeoplePicker;

beforeAll(async () => {
  ({ PeoplePicker } = await import("../src/pages/admin/components/classes/PeoplePicker.jsx"));
});

const open = (props = {}) => {
  const onApply = jest.fn();
  render(
    <PeoplePicker
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

/** The row a name sits on, whichever group it is in. */
const rowFor = (name) => screen.getByText(name).closest("label");

const showTaken = () =>
  fireEvent.click(screen.getByRole("button", { name: /Show the 1 already in this course/ }));

describe("PeoplePicker", () => {
  it("offers only the students no other section on this course holds", () => {
    open();

    expect(screen.getByText("Available for this class (3)")).toBeInTheDocument();
    expect(screen.getByText("Angela Reyes")).toBeInTheDocument();
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

  it("opens with the students the class already has ticked", () => {
    open({ selected: ["s2"] });

    expect(screen.getByRole("status")).toHaveTextContent("1 student selected");
    expect(rowFor("Mark Anthony Santos")).toHaveClass("is-picked");
  });

  it("filters by name and by student number", () => {
    open();

    const search = screen.getByLabelText("Search students");
    fireEvent.change(search, { target: { value: "nicole" } });
    expect(screen.getByText("Available for this class (1)")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "202300002" } });
    expect(screen.getByText("Angela Reyes")).toBeInTheDocument();
    expect(screen.queryByText("Nicole Fernandez")).not.toBeInTheDocument();
  });

  /**
   * The rule the panel exists to show. Someone in another section is kept on
   * screen — hiding them raises "where did Nicole go?", and that they are in
   * the other section is the answer — but the row cannot be ticked.
   */
  describe("a student another section already holds", () => {
    it("is shown behind the toggle, greyed and closed", () => {
      open();
      showTaken();

      const row = rowFor("Chris Jerome Dayan");
      expect(row).toHaveClass("is-locked");
      expect(within(row).getByRole("checkbox")).toBeDisabled();
      expect(within(row).getByText(/already in this course/)).toBeInTheDocument();
    });

    it("says why once, under the group", () => {
      open();
      showTaken();

      expect(screen.getByText(/A student can only be in one/)).toBeInTheDocument();
    });

    it("cannot be added by clicking the row", () => {
      const { onApply } = open();
      showTaken();

      fireEvent.click(screen.getByText("Chris Jerome Dayan"));

      expect(screen.getByRole("status")).toHaveTextContent("0 students selected");
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onApply).toHaveBeenCalledWith([]);
    });
  });

  /**
   * The class being edited is itself a section of this course, so its own
   * students are enrolled in it. Without `ownIds` the panel would read them as
   * somebody else's and lock the class out of editing its own roster.
   */
  describe("the class's own students", () => {
    it("stay in the open list, ticked and removable", () => {
      open({ selected: ["s4"], ownIds: ["s4"] });

      expect(screen.getByText("Available for this class (4)")).toBeInTheDocument();

      const row = rowFor("Chris Jerome Dayan");
      expect(row).not.toHaveClass("is-locked");
      expect(row).toHaveClass("is-picked");
      expect(within(row).getByRole("checkbox")).not.toBeDisabled();
    });

    it("can be unticked to take them out of the class", () => {
      const { onApply } = open({ selected: ["s4"], ownIds: ["s4"] });

      fireEvent.click(screen.getByText("Chris Jerome Dayan"));
      expect(screen.getByRole("status")).toHaveTextContent("0 students selected");

      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onApply).toHaveBeenCalledWith([]);
    });

    it("leaves nothing behind the toggle when this is the only section", () => {
      open({ selected: ["s4"], ownIds: ["s4"] });

      expect(screen.queryByRole("button", { name: /already in this course/ })).not.toBeInTheDocument();
    });
  });
});
