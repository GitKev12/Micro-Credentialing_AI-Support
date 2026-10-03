import { useState } from "react";

import { CheckIcon } from "../icons";
import { AdminModal } from "./AdminModal";
import { AdminButton } from "./primitives";

/**
 * Shows a new account's sign-in details once, after it is created or its
 * password is reset. The password is not stored where it can be read again,
 * so this is the admin's only chance to copy it.
 */
export function NewPasswordModal({ title, name, idNumber, password, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`ID number: ${idNumber}\nPassword: ${password}`);
      setCopied(true);
    } catch {
      setCopied(false); // the details are still on screen to copy by hand
    }
  };

  return (
    <AdminModal
      title={title}
      subtitle={name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="admin-chip-btn admin-chip-btn--quiet" onClick={copy}>
            {copied ? (
              <>
                <CheckIcon size={13} /> Copied
              </>
            ) : (
              "Copy details"
            )}
          </button>
          <AdminButton variant="admin-btn--compact" onClick={onClose}>
            Done
          </AdminButton>
        </>
      }
    >
      <dl className="admin-credentials">
        <div>
          <dt>ID number</dt>
          <dd>{idNumber}</dd>
        </div>
        <div>
          <dt>Password</dt>
          <dd>{password}</dd>
        </div>
      </dl>
      <p className="admin-notice" role="status">
        Copy the password now. It won't be shown again.
      </p>
    </AdminModal>
  );
}

/** On an edit: ask the server to make a new password when the form is saved. */
export function NewPasswordChoice({ checked, onChange }) {
  return (
    <label className="admin-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      Generate a new password when I save
    </label>
  );
}
