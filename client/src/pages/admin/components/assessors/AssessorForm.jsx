import { useState } from "react";

import { MIN_PASSWORD_LENGTH } from "../../../../services/admin";
import { AdminButton, AdminField, AdminModal } from "../ui";

/**
 * Add an assessor, or correct one who already exists.
 *
 * One form for both, as with students. The password is required on a new
 * account and optional on an existing one, where an empty box keeps the
 * current password rather than clearing it.
 */
function AssessorForm({ assessor, busy, error, onCancel, onSave }) {
  const creating = !assessor;

  const [name, setName] = useState(assessor?.name ?? "");
  const [email, setEmail] = useState(assessor?.email ?? "");
  const [assessorNumber, setAssessorNumber] = useState(assessor?.assessorNumber ?? "");
  const [password, setPassword] = useState("");

  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const passwordOk = creating ? longEnough : password === "" || longEnough;
  const ready = name.trim() && email.trim() && passwordOk;

  return (
    <AdminModal
      title={creating ? "New assessor" : "Edit assessor"}
      subtitle={creating ? null : assessor.name}
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
                name: name.trim(),
                email: email.trim(),
                assessorNumber: assessorNumber.trim(),
                ...(password ? { password } : {})
              })
            }
          >
            {busy ? "Saving…" : creating ? "Create assessor" : "Save changes"}
          </AdminButton>
        </>
      }
    >
      {error ? (
        <p className="admin-notice admin-notice--error" role="status">
          {error}
        </p>
      ) : null}

      <AdminField label="Full name" value={name} onChange={setName} required />
      <AdminField
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        required
      />
      <AdminField
        label="Assessor number"
        value={assessorNumber}
        onChange={setAssessorNumber}
        placeholder="e.g. ASS007"
      />
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

export default AssessorForm;
