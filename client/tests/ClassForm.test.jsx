import { describe, it, expect, jest, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, fireEvent } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

let ClassForm;

beforeAll(async () => {
  ClassForm = (await import("../src/pages/admin/components/classes/ClassForm.jsx")).default;
});

const COURSES = [{ id: "c1", code: "CC2", title: "Computer Programming 2" }];
const ASSESSORS = [
  { id: "a1", name: "Ramon Velasco", assessorNumber: "ASS001" },
  { id: "a2", name: "Teresa Buenaventura", assessorNumber: "ASS002" }
];
const KLASS = {
  id: "k1",
  name: "Section-A",
  course: { id: "c1", code: "CC2" },
  assessors: [{ id: "a1", name: "Ramon Velasco" }],
  students: [],
  mode: "taught",
  schedule: { days: "MWF", time: "09:00–10:00", room: "Lab 201" }
};

const draw = (props) =>
  render(
    <ClassForm
      courses={COURSES}
      assessors={ASSESSORS}
      students={[]}
      busy={false}
      error={null}
      onCancel={() => {}}
      onSave={() => {}}
      {...props}
    />
  );

describe("editing a class after it is created", () => {
  it("locks the section, course and pathway, and says so", () => {
    draw({ klass: KLASS });

    expect(screen.getByText(/Only the assessor, students, schedule and enrollment can be changed/)).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Section" }).disabled).toBe(true);
    expect(screen.getByRole("combobox", { name: "Course" }).disabled).toBe(true);
    expect(screen.getByRole("combobox", { name: "Assessor" }).disabled).toBe(false);
    expect(screen.getByLabelText("Days").readOnly).toBe(false);
    expect(screen.getByLabelText("Room").readOnly).toBe(false);
  });

  it("sends only the assessor, the students, the schedule and the enrollment", () => {
    const onSave = jest.fn();
    draw({ klass: KLASS, onSave });

    fireEvent.change(screen.getByLabelText("Room"), { target: { value: "Lab 305" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave.mock.calls[0][0]).toEqual({
      assessorIds: ["a1"],
      studentIds: [],
      schedule: { days: "MWF", time: "09:00–10:00", room: "Lab 305" },
      // A class written before Discover reads as Needs approval.
      enrollment: "approval"
    });
  });

  it("clears the schedule when the box is unticked", () => {
    const onSave = jest.fn();
    draw({ klass: KLASS, onSave });

    fireEvent.click(screen.getByLabelText("Add a schedule"));
    expect(screen.queryByLabelText("Days")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave.mock.calls[0][0].schedule).toEqual({ days: "", time: "", room: "" });
  });

  it("leaves everything open on a new class, with the schedule hidden until ticked", () => {
    draw({ klass: null });

    expect(screen.queryByText(/Only the assessor, students, schedule and enrollment can be changed/)).toBeNull();
    expect(screen.getByRole("combobox", { name: "Course" }).disabled).toBe(false);
    expect(screen.queryByLabelText("Days")).toBeNull();
    fireEvent.click(screen.getByLabelText("Add a schedule"));
    expect(screen.getByLabelText("Days").readOnly).toBe(false);
  });
});
