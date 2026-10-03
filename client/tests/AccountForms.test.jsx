import { describe, it, expect, jest, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

jest.unstable_mockModule("../src/services/admin.js", () => ({
  fetchNextIdNumber: async (kind) => (kind === "students" ? "STU2023300026" : "ASS017"),
  // Used by the Import tab of the student form.
  createStudent: jest.fn()
}));

let StudentForm, AssessorForm;

beforeAll(async () => {
  StudentForm = (await import("../src/pages/admin/components/students/StudentForm.jsx")).default;
  AssessorForm = (await import("../src/pages/admin/components/assessors/AssessorForm.jsx")).default;
});

const STUDENT = { id: "s1", name: "Ana Cruz", email: "ana@tsu.edu.ph", studentNumber: "2021-0001" };
const ASSESSOR = { id: "a1", name: "Michael Torres", email: "mt@tsu.edu.ph", assessorNumber: "ASS001" };

const save = () => jest.fn();
const draw = (Form, props) =>
  render(<Form busy={false} error={null} onCancel={() => {}} onSave={() => {}} {...props} />);

describe("StudentForm — one form for new and existing", () => {
  it("opens blank as a create form", () => {
    draw(StudentForm, { student: null });

    expect(screen.getByRole("heading", { name: "New student" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create student" })).toBeTruthy();
    expect(screen.getByLabelText(/First name/).value).toBe("");
  });

  it("opens filled as an edit form", () => {
    draw(StudentForm, { student: STUDENT });

    expect(screen.getByRole("heading", { name: "Edit student" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(screen.getByLabelText(/First name/).value).toBe("Ana");
    expect(screen.getByLabelText(/Last name/).value).toBe("Cruz");
  });

  // The server makes the ID number and password, so creating asks for neither.
  it("asks a new student only for names and email", async () => {
    const onSave = save();
    draw(StudentForm, { student: null, onSave });

    // The ID it will get is shown, locked; there is no password box.
    const idBox = screen.getByLabelText(/ID number/);
    await waitFor(() => expect(idBox.value).toBe("STU2023300026"));
    expect(idBox.readOnly).toBe(true);
    expect(screen.getByText(/Assigned automatically when you save/)).toBeTruthy();
    expect(screen.queryByLabelText(/Password/)).toBeNull();

    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Cruz" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "ana@tsu.edu.ph" } });
    fireEvent.click(screen.getByRole("button", { name: "Create student" }));

    expect(onSave.mock.calls[0][0]).toEqual({
      firstName: "Ana",
      lastName: "Cruz",
      email: "ana@tsu.edu.ph"
    });
  });

  it("refuses a one-letter name, a name with symbols and a fake email", () => {
    draw(StudentForm, { student: null });

    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Cruz@" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "s@g.c" } });

    expect(screen.getByText("First name must be at least 2 letters.")).toBeTruthy();
    expect(screen.getByText(/Last name can only have letters/)).toBeTruthy();
    expect(screen.getByText(/Enter a valid email address/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create student" }).disabled).toBe(true);
  });

  // An edit that leaves the box alone must not be read as "clear the password",
  // or fixing a spelling would lock someone out.
  it("saves an edit with the password left blank", () => {
    const onSave = save();
    draw(StudentForm, { student: STUDENT, onSave });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].password).toBeUndefined();
  });

  it("shows the ID number locked when editing, and never sends it", () => {
    const onSave = save();
    draw(StudentForm, { student: STUDENT, onSave });

    expect(screen.getByLabelText(/ID number/).readOnly).toBe(true);
    expect(screen.getByLabelText(/ID number/).value).toBe("2021-0001");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave.mock.calls[0][0].studentNumber).toBeUndefined();
  });

  it("asks the server for a new password when the box is ticked", () => {
    const onSave = save();
    draw(StudentForm, { student: STUDENT, onSave });

    fireEvent.click(screen.getByLabelText(/Generate a new password/));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave.mock.calls[0][0].resetPassword).toBe(true);
  });
});

describe("AssessorForm — the same two modes", () => {
  it("opens blank as a create form", () => {
    draw(AssessorForm, { assessor: null });

    expect(screen.getByRole("heading", { name: "New assessor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create assessor" })).toBeTruthy();
  });

  it("opens filled as an edit form", () => {
    draw(AssessorForm, { assessor: ASSESSOR });

    expect(screen.getByRole("heading", { name: "Edit assessor" })).toBeTruthy();
    expect(screen.getByLabelText(/Full name|Name/).value).toBe("Michael Torres");
  });

  it("creates with only a name and email", async () => {
    const onSave = save();
    draw(AssessorForm, { assessor: null, onSave });

    await waitFor(() => expect(screen.getByLabelText(/ID number/).value).toBe("ASS017"));
    fireEvent.change(screen.getByLabelText(/Full name|Name/), { target: { value: "Ana Cruz" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "ana@tsu.edu.ph" } });
    fireEvent.click(screen.getByRole("button", { name: "Create assessor" }));

    expect(onSave.mock.calls[0][0]).toEqual({ name: "Ana Cruz", email: "ana@tsu.edu.ph" });
  });

  it("will not create with a name that has symbols", () => {
    draw(AssessorForm, { assessor: null });

    fireEvent.change(screen.getByLabelText(/Full name|Name/), { target: { value: "Ana #1" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "ana@tsu.edu.ph" } });

    expect(screen.getByRole("button", { name: "Create assessor" }).disabled).toBe(true);
  });
});
