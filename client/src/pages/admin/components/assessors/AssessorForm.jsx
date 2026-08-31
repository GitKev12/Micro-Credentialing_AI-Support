import { useState } from "react";
import { AdminButton, AdminField, AdminModal } from "../ui";

/**
 * Correct an existing assessor's details.
 *
 * Editing only, as with students — this console does not create accounts. An
 * empty password box keeps the current one rather than clearing it.
 */
function AssessorForm({ assessor, busy, error, onCancel, onSave }) {
  const [name, setName] = useState(assessor?.name ?? "");
  const [email, setEmail] = useState(assessor?.email ?? "");
  const [assessorNumber, setAssessorNumber] = useState(assessor?.assessorNumber ?? "");
  const [password, setPassword] = useState("");

  const passwordOk = password === "" || password.length >= MIN_PASSWORD_LENGTH;
  const ready = name.trim() && email.trim() && passwordOk;

  return (
    <AdminModal
      title="Edit assessor"
      subtitle={assessor.name}
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

export default AssessorForm;
