import { useEffect } from "react";

import { moduleFileUrl } from "../../../../services/learningModules";
import { moduleMeta } from "./impact";

/**
 * Preview: the lesson exactly as it was uploaded.
 *
 * The PDF is shown rather than the formatted reader a student sees, because
 * what an admin is checking here is the file — that the right document landed
 * on the right course. The route it points at is the same one the student app
 * streams from, so a module that previews is a module that opens.
 */
function ModulePreview({ module, onClose }) {
  const url = moduleFileUrl(module.id);

  // Escape closes it, as it would any dialog.
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
      aria-label={`Preview of ${module.title}`}
      onClick={onClose}
    >
      <div className="admin-modal__panel" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal__head">
          <div>
            <h2 className="admin-modal__title">{module.title}</h2>
            <p className="admin-modal__meta">{moduleMeta(module)}</p>
          </div>
          <div className="admin-modal__actions">
            <a
              className="admin-chip-btn admin-chip-btn--quiet"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              Open in new tab
            </a>
            <button
              type="button"
              className="admin-modal__close"
              onClick={onClose}
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
        </div>

        <iframe className="admin-modal__frame" src={url} title={`${module.title} preview`} />
      </div>
    </div>
  );
}

export default ModulePreview;
