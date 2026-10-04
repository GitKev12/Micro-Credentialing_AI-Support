import { useEffect, useState } from "react";

import { MAX_LENGTH, checkEmail, checkName } from "../../../../lib/fieldRules";
import { fetchNextIdNumber } from "../../../../services/admin";
import { AdminButton, AdminField, AdminModal, NewPasswordChoice } from "../ui";

/**
 * Add an assessor, or correct one who already exists.
 *
 * One form for both, as with students. A new assessor gets their ID number
 * and password from the server, so the form only asks for name and email.
 * Editing can ask for a new password, which the server also makes.
 */
function AssessorForm({ assessor, busy, error, onCancel, onSave }) {
  const creating = !assessor;

  const [name, setName] = useState(assessor?.name ?? "");
  const [email, setEmail] = useState(assessor?.email ?? "");
  const [assessorNumber, setAssessorNumber] = useState(assessor?.assessorNumber ?? "");
  const [resetPassword, setResetPassword] = useState(false);

  // A new account shows the ID it will most likely get. The server picks the
  // final one when saving, so this is only a preview.
  useEffect(() => {
    if (!creating) return;
    fetchNextIdNumber("assessors")
      .then(setAssessorNumber)
      .catch(() => setAssessorNumber(""));
  }, [creating]);

  // A message shows only once something is typed; an empty box just keeps
  // the button off.
  const nameError = name ? checkName(name, "Full name") : null;
  const emailError = email ? checkEmail(email) : null;
  const ready = !checkName(name) && !checkEmail(email);

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
                ...(resetPassword ? { resetPassword: true } : {})
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

      <AdminField
        label="Full name"
        maxLength={MAX_LENGTH.name}
        value={name}
        onChange={setName}
        error={nameError}
        required
      />
      <AdminField
        label="Email"
        maxLength={MAX_LENGTH.email}
        type="email"
        value={email}
        onChange={setEmail}
        error={emailError}
        required
      />
      <AdminField
        label="ID number"
        maxLength={MAX_LENGTH.idNumber}
        value={assessorNumber}
        onChange={setAssessorNumber}
        placeholder={creating ? "Loading…" : undefined}
        hint={
          creating
            ? "Assigned automatically when you save. It can't be changed."
            : "Assigned automatically. It can't be changed."
        }
        locked
      />
      {creating ? null : (
        <NewPasswordChoice checked={resetPassword} onChange={setResetPassword} />
      )}
    </AdminModal>
  );
}

export default AssessorForm;
