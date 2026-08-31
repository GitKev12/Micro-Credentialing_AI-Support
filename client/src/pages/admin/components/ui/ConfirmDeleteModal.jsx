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
 */
export function ConfirmDeleteModal({
  title,
  subject,
  losses,
  keeps = [],
  busy = false,
  confirmLabel = "Delete",
  onCancel,
  onConfirm
}) {
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
            disabled={busy || !losses}
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
        </>
      )}
    </AdminModal>
  );
}
