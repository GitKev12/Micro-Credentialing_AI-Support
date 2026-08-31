import { useEffect, useRef } from "react";

/**
 * Centred dialog for the forms and the delete confirmations.
 *
 * Escape closes it and the backdrop click closes it, because a dialog that can
 * only be dismissed by finding the right button is a trap on a small screen.
 * Nothing here traps focus: that needs more than this component is, and the
 * forms it holds are short enough that tabbing past them is not the hazard a
 * half-built focus trap would be.
 */
export function AdminModal({ title, subtitle, onClose, children, footer, tone = "" }) {
  // Whether the press that is about to become a click started on the backdrop.
  // Selecting text in a field and releasing outside the panel produces a click
  // whose target is the backdrop, which used to read as "dismiss" and threw
  // away everything typed into the form.
  const fromBackdrop = useRef(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="admin-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        fromBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const onBackdrop = event.target === event.currentTarget && fromBackdrop.current;
        fromBackdrop.current = false;
        if (onBackdrop) onClose();
      }}
    >
      <div
        className={`admin-modal__panel admin-modal__panel--form${tone ? ` ${tone}` : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal__head">
          <div>
            <h2 className="admin-modal__title">{title}</h2>
            {subtitle ? <p className="admin-modal__meta">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="admin-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="admin-modal__body">{children}</div>

        {footer ? <div className="admin-modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}
