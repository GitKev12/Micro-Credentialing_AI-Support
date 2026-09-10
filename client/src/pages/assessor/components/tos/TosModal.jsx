import { useEffect, useRef } from "react";
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
 * carries .entity-enter, whose entrance animation is filled `both`, so its
 * final transform stands for the life of the page — and a transformed ancestor
 * is the containing block for anything fixed inside it. Left in place the
 * overlay sized itself to the whole document and opened wherever the page
 * happened to be scrolled to. The portal host wears the console's own class
 * for its custom properties and is display:contents, so it carries the tokens
 * without carrying a box.
 */
export default function TosModal({ courseId, mode, lessonId, onClose, onSaved }) {
  const panel = useRef(null);
  // Where the keyboard was when this opened, so it can be put back.
  const opener = useRef(null);

  useEffect(() => {
    opener.current = document.activeElement;
    panel.current?.focus();

    const onKey = (event) => {
      if (event.key === "Escape") onClose();
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
  }, [onClose]);

  return createPortal(
    <div className="assessor-app tos-portal">
      <div
        className="tos-modal"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className="tos-modal__panel"
          role="dialog"
          aria-modal="true"
          aria-label="Table of Specification"
          tabIndex={-1}
          ref={panel}
        >
          <TosEditor
            courseId={courseId}
            defaultMode={mode}
            defaultLesson={lessonId}
            onSaved={onSaved}
            headerEnd={
              <button
                type="button"
                className="tos-modal__close"
                onClick={onClose}
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
