import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "../icons";
import TosEditor from "./TosEditor";

/**
 * The blueprint, opened over the screen that spends it.
 *
 * It is a dialog rather than a route because of what the assessor is doing
 * when they need it: they are looking at a lesson and a count on the generate
 * screen, and they want the plan behind those numbers changed and then to
 * carry on. Navigating away and back would lose the paper they had open, the
 * lesson they had picked and the questions they were half way through
 * correcting.
 *
 * The page behind is blurred rather than merely dimmed. Dimming says the page
 * is inactive; blurring says it is still there and still the subject — the
 * blueprint is about that course, and the dialog is a layer over the work
 * rather than a different place.
 *
 * It renders into the body rather than where it is written. `.assessor-app`
 * carries .entity-enter, whose entrance animation was once filled `both`, so
 * its final transform stood for the life of the page — and a transformed
 * ancestor is the containing block for anything fixed inside it. Left in place
 * the overlay sized itself to the whole document and opened wherever the page
 * happened to be scrolled to. The fill is `backwards` now (see styles.css);
 * the portal stays, since a dialog over the whole screen should not depend on
 * no box above it ever animating again. The portal host wears the console's own class
 * for its custom properties and is display:contents, so it carries the tokens
 * without carrying a box.
 */
export default function TosModal({ courseId, mode, lessonId, onClose, onSaved, classId = null, assessOnly = false }) {
  // The panel is handed to the editor as well: switching paper resizes it,
  // and the editor is the one that knows when that happens and by how much.
  const panel = useRef(null);
  const [contentReady, setContentReady] = useState(false);
  // Where the keyboard was when this opened, so it can be put back.
  const opener = useRef(null);
  // Unsaved edits in the editor, and whether we are asking about them.
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const keepEditing = useRef(null);

  // Closing with unsaved edits asks first, instead of throwing them away.
  const requestClose = () => {
    if (dirty) setConfirming(true);
    else onClose();
  };

  // The latest version, for the key listener below, which is added once.
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;
  const confirmingRef = useRef(confirming);
  confirmingRef.current = confirming;

  useEffect(() => {
    opener.current = document.activeElement;
    panel.current?.focus();

    const onKey = (event) => {
      if (event.key !== "Escape") return;
      // Escape while asking means "keep editing".
      if (confirmingRef.current) {
        setConfirming(false);
        return;
      }
      // Escape inside a number box is not a request to close the dialog.
      if (event.target?.closest?.("input, textarea, select")) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);

    // The dialog scrolls; the page under it must not, or a scroll that runs
    // past the end of the blueprint carries the screen behind it instead.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener.current?.focus?.();
    };
    // Once per opening. It used to re-run on every render of the page behind,
    // which pulled the keyboard out of whatever box the assessor was typing in.
  }, []);

  // Put the keyboard on "Keep editing" when the question appears.
  useEffect(() => {
    if (confirming) keepEditing.current?.focus();
  }, [confirming]);

  return createPortal(
    <div className="assessor-app tos-portal">
      <div
        className="tos-modal"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}
      >
        <div
          className={`tos-modal__panel${contentReady ? " is-loaded" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Table of Specification"
          tabIndex={-1}
          ref={panel}
        >
          {confirming ? (
            <div className="tos-modal__confirm" role="alertdialog" aria-label="Unsaved changes">
              <p className="tos-modal__confirm-text">You have unsaved changes. Discard them?</p>
              <div className="tos-modal__confirm-actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  ref={keepEditing}
                  onClick={() => setConfirming(false)}
                >
                  Keep editing
                </button>
                <button type="button" className="btn btn--ghost btn--sm tos-modal__discard" onClick={onClose}>
                  Discard changes
                </button>
              </div>
            </div>
          ) : null}

          <TosEditor
            courseId={courseId}
            classId={classId}
            assessOnly={assessOnly}
            defaultMode={mode}
            defaultLesson={lessonId}
            frame={panel}
            onReady={setContentReady}
            onSaved={onSaved}
            onDirtyChange={setDirty}
            headerEnd={
              <button
                type="button"
                className="tos-modal__close"
                onClick={requestClose}
                aria-label="Close the blueprint"
              >
                <CloseIcon size={15} />
              </button>
            }
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
