import { useState } from "react";

import { AdminField } from "./AdminField";
import { AdminModal } from "./AdminModal";
import { AdminButton } from "./primitives";

/**
 * The confirmation for anything that destroys records.
 *
 * `losses` is the list of what goes, read from the server before the dialog can
 * be agreed to — null while that is still loading, which is why the confirm
 * button waits for it. Agreeing to a deletion whose cost has not arrived is
 * agreeing to nothing in particular, and these deletions take student records
 * with them.
 *
 * `confirmWord` is a word that has to be typed out before the dialog will
 * agree — pass "CONFIRM" and nothing happens until it is in the box. Reading
 * the list of what goes is a decision; typing the word is the act, and it is
 * what a mis-aimed click cannot do on its own. Matched trimmed and without
 * regard to case: caps-lock is friction, not intent.
 *
 * `error` is what came back from a refused attempt. It belongs in the dialog
 * rather than behind it: the dialog stays open, so the admin can see what went
 * wrong without having to start again.
 */
export function ConfirmDeleteModal({
  title,
  subject,
  losses,
  keeps = [],
  busy = false,
  confirmLabel = "Delete",
  confirmWord = null,
  error = null,
  onCancel,
  onConfirm
}) {
  const [typed, setTyped] = useState("");
  const wordTyped = typed.trim().toLowerCase() === String(confirmWord).toLowerCase();
  const confirmable = Boolean(losses) && (!confirmWord || wordTyped);

  return (
    <AdminModal
      title={title}
      subtitle={subject}
      tone="admin-modal__panel--danger"
      onClose={busy ? () => {} : onCancel}
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
            variant="admin-btn--compact admin-btn--danger"
            disabled={busy || !confirmable}
            onClick={onConfirm}
          >
            {busy ? "Deleting…" : confirmLabel}
          </AdminButton>
        </>
      }
    >
      {!losses ? (
        <p className="admin-empty-note">Checking what this would remove…</p>
      ) : (
        <>
          {losses.length > 0 ? (
            <>
              <p className="admin-modal__lead">This will also permanently delete:</p>
              <ul className="admin-loss-list">
                {losses.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="admin-modal__lead">Nothing else depends on this.</p>
          )}

          {keeps.length > 0 ? (
            <>
              <p className="admin-modal__lead">What stays:</p>
              <ul className="admin-loss-list admin-loss-list--keep">
                {keeps.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}

          <p className="admin-empty-note">This cannot be undone.</p>

          {confirmWord ? (
            <div className="admin-confirm-word">
              <AdminField
                label={`Type ${confirmWord} to continue`}
                value={typed}
                onChange={setTyped}
                autoComplete="off"
                placeholder={confirmWord}
                required
              />
            </div>
          ) : null}

          {error ? (
            <p className="admin-notice admin-notice--error" role="status">
              {error}
            </p>
          ) : null}
        </>
      )}
    </AdminModal>
  );
}
