import { useState } from "react";
import { AdminButton, AdminField, AdminModal } from "../ui";

/**
 * Correct an existing student's details.
 *
 * Editing only — this console does not create accounts, so there is no blank
 * version of this form. An empty password box means "keep the current one"
 * rather than "clear it", and says so: a form that silently blanked a password
 * because a name was being fixed would lock someone out without ever saying it
 * had.
 */
function StudentForm({ student, busy, error, onCancel, onSave }) {
  const [firstName, setFirstName] = useState(student?.name?.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(
    student?.name?.split(" ").slice(1).join(" ") ?? ""
  );
  const [email, setEmail] = useState(student?.email ?? "");
  const [studentNumber, setStudentNumber] = useState(student?.studentNumber ?? "");
  const [password, setPassword] = useState("");

  const passwordOk = password === "" || password.length >= MIN_PASSWORD_LENGTH;
  const ready = firstName.trim() && lastName.trim() && email.trim() && passwordOk;

  return (
    <AdminModal
      title="Edit student"
      subtitle={student.name}
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
            {busy ? "Saving…" : "Save changes"}
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
      <AdminField
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        required
      />
      <AdminField
        label="Student number"
        value={studentNumber}
        onChange={setStudentNumber}
        placeholder="e.g. 202300007"
      />
      {/* No program or year. A degree batch is not what a micro-credential is
          awarded against, so the form does not collect one. */}
      <AdminField
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        placeholder="Leave blank to keep the current one"
      />
    </AdminModal>
  );
}

export default StudentForm;
