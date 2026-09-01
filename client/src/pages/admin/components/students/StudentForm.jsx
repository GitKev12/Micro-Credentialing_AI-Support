import { useState } from "react";

import { MIN_PASSWORD_LENGTH } from "../../../../services/admin";
import { AdminButton, AdminField, AdminModal } from "../ui";

/**
 * Add a student, or correct one who already exists.
 *
 * One form for both, the way the course form works: the fields are identical
 * and the only difference is whether it opens empty, so a second near-copy
 * would just be a second place to fix when a field is added.
 *
 * The password is the one field that behaves differently between the two. On a
 * new account it is required — there is nothing to fall back on. On an existing
 * one an empty box means "keep the current one" rather than "clear it", and
 * says so: a form that silently blanked a password because a name was being
 * fixed would lock someone out without ever saying it had.
 */
function StudentForm({ student, busy, error, onCancel, onSave }) {
  const creating = !student;

  const [firstName, setFirstName] = useState(student?.name?.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(student?.name?.split(" ").slice(1).join(" ") ?? "");
  const [email, setEmail] = useState(student?.email ?? "");
  const [studentNumber, setStudentNumber] = useState(student?.studentNumber ?? "");
  const [password, setPassword] = useState("");

  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const passwordOk = creating ? longEnough : password === "" || longEnough;
  const ready = firstName.trim() && lastName.trim() && email.trim() && passwordOk;

  return (
    <AdminModal
      title={creating ? "New student" : "Edit student"}
      subtitle={creating ? null : student.name}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            className="admin-chip-btn admin-chip-btn--quiet"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <AdminButton
            variant="admin-btn--compact"
            disabled={busy || !ready}
            onClick={() =>
              onSave({
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim(),
                studentNumber: studentNumber.trim(),
                ...(password ? { password } : {})
              })
            }
          >
            {busy ? "Saving…" : creating ? "Create student" : "Save changes"}
          </AdminButton>
        </>
      }
    >
      {error ? (
        <p className="admin-notice admin-notice--error" role="status">
          {error}
        </p>
      ) : null}

      <AdminField label="First name" value={firstName} onChange={setFirstName} required />
      <AdminField label="Last name" value={lastName} onChange={setLastName} required />
      <AdminField label="Email" type="email" value={email} onChange={setEmail} required />
      <AdminField
        label="Student number"
        value={studentNumber}
        onChange={setStudentNumber}
        placeholder="e.g. 202300007"
      />
      {/* No program or year. A degree batch is not what a micro-credential is
          awarded against, so the form does not collect one. */}
      <AdminField
        label={creating ? "Password" : "New password"}
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        required={creating}
        placeholder={
          creating
            ? `At least ${MIN_PASSWORD_LENGTH} characters`
            : "Leave blank to keep the current one"
        }
        hint={
          password && !longEnough
            ? `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`
            : undefined
        }
      />
    </AdminModal>
  );
}

export default StudentForm;
