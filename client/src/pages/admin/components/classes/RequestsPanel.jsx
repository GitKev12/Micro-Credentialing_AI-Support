import { useEffect } from "react";
import { StudentsIcon } from "../icons";
import { AdminButton } from "../ui";

/**
 * The Discover requests for one class — a panel beside the class form, the
 * same drawer the student picker uses.
 *
 * Each answer is written at once. Accepting puts the student in the Students
 * list on the form beside it, so the admin sees them join.
 */
export function RequestsPanel({ requests, classLabel, busy, error, closing = false, onAnswer, onClose, onClosed }) {
  // Same floor under the closing animation as the student picker.
  useEffect(() => {
    if (!closing) return undefined;
    const timer = setTimeout(onClosed, 400);
    return () => clearTimeout(timer);
  }, [closing, onClosed]);

  // Escape closes the panel, not the form beside it.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const count = requests.length;

  return (
    <div className="admin-drawer" role="dialog" aria-modal="true" aria-label="Requests" onClick={onClose}>
      <aside
        className={`admin-modal__panel admin-modal__panel--form admin-drawer__panel${closing ? " is-closing" : ""}`}
        onClick={(event) => event.stopPropagation()}
        onAnimationEnd={() => {
          if (closing) onClosed();
        }}
      >
        <header className="admin-drawer__head">
          <div>
            <h2 className="admin-drawer__title">
              <span className="admin-card__title-mark" aria-hidden="true">
                <StudentsIcon size={18} />
              </span>
              Requests
            </h2>
            <p className="admin-drawer__sub">{classLabel}</p>
          </div>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="admin-drawer__count" role="status">
          <strong>{count}</strong> {count === 1 ? "student" : "students"} waiting
        </p>

        {error ? (
          <p className="admin-notice admin-notice--error admin-drawer__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-drawer__body">
          {count === 0 ? (
            <p className="admin-empty-note">No requests waiting.</p>
          ) : (
            <ul className="admin-class-requests__list">
              {requests.map((request) => (
                <li className="admin-class-requests__item" key={request.studentId}>
                  <span className="admin-class-requests__who">
                    <span className="admin-class-requests__name" title={request.name}>
                      {request.name}
                    </span>
                    <span className="admin-class-requests__id">{request.studentNumber}</span>
                  </span>
                  <span className="admin-class-requests__acts">
                    <AdminButton variant="admin-btn--compact" disabled={busy} onClick={() => onAnswer(request, true)}>
                      Accept
                    </AdminButton>
                    <button
                      type="button"
                      className="admin-chip-btn admin-chip-btn--quiet"
                      disabled={busy}
                      onClick={() => onAnswer(request, false)}
                    >
                      Decline
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="admin-drawer__foot">
          <AdminButton variant="admin-btn--compact" onClick={onClose}>
            Done
          </AdminButton>
        </footer>
      </aside>
    </div>
  );
}

export default RequestsPanel;
