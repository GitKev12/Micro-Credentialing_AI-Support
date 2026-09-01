import { describe, it, expect, jest, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, fireEvent } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

jest.unstable_mockModule("../src/services/admin.js", () => ({
  MIN_PASSWORD_LENGTH: 8
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

  // There is nothing to fall back on for a new account, so the password is the
  // one field that behaves differently between the two modes.
  it("will not create without a password", () => {
    draw(StudentForm, { student: null });

    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Cruz" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "ana@tsu.edu.ph" } });

    expect(screen.getByRole("button", { name: "Create student" }).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "longenough" } });
    expect(screen.getByRole("button", { name: "Create student" }).disabled).toBe(false);
  });

  it("refuses a password shorter than the API will store", () => {
    draw(StudentForm, { student: null });

    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Cruz" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "ana@tsu.edu.ph" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "short" } });

    expect(screen.getByRole("button", { name: "Create student" }).disabled).toBe(true);
    expect(screen.getByText(/at least 8 characters/)).toBeTruthy();
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

  it("sends the password when one was typed", () => {
    const onSave = save();
    draw(StudentForm, { student: STUDENT, onSave });

    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave.mock.calls[0][0].password).toBe("longenough");
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

  it("will not create without a password", () => {
    draw(AssessorForm, { assessor: null });

    fireEvent.change(screen.getByLabelText(/Full name|Name/), { target: { value: "Ana Cruz" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "ana@tsu.edu.ph" } });

    expect(screen.getByRole("button", { name: "Create assessor" }).disabled).toBe(true);
  });
});
