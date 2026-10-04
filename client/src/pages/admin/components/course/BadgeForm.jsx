import { useRef, useState } from "react";

import { MAX_BADGE_ICON_BYTES } from "../../../../services/admin";
import { BadgeIcon } from "../icons";
import { AdminButton, AdminField, AdminModal } from "../ui";
import { fileSizeLabel } from "../../lib/format";

// Reads a picked file as a "data:…" string, ready to send and to preview.
const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Add or edit the badge for one lesson, like Moodle: name, picture,
 * description, the rule for earning it, and "Enable access".
 */
function BadgeForm({ module, busy, error, onCancel, onSave, onDelete }) {
  const badge = module.badge;
  const [title, setTitle] = useState(badge?.title ?? module.title);
  const [description, setDescription] = useState(
    badge?.description ?? `Earned by passing the quiz for the lesson "${module.title}".`
  );
  const [icon, setIcon] = useState(null); // a new picture, not saved yet
  const [active, setActive] = useState(badge?.active ?? false);
  const [pictureError, setPictureError] = useState(null);
  const [askingDelete, setAskingDelete] = useState(false);
  const inputRef = useRef(null);

  const preview = icon ?? badge?.icon ?? null;
  const ready = title.trim() && preview;

  const takeFile = async (file) => {
    if (!file) return;
    setPictureError(null);
    if (file.size > MAX_BADGE_ICON_BYTES) {
      setPictureError(`That picture is ${fileSizeLabel(file.size)} — the limit is 100 KB.`);
      return;
    }
    setIcon(await readAsDataUrl(file));
  };

  return (
    <AdminModal
      title={badge ? "Edit badge" : "Add badge"}
      subtitle={module.title}
      onClose={onCancel}
      footer={
        <>
          {badge && onDelete ? (
            askingDelete ? (
              <button type="button" className="admin-chip-btn" disabled={busy} onClick={onDelete}>
                Yes, delete badge
              </button>
            ) : (
              <button
                type="button"
                className="admin-chip-btn admin-chip-btn--quiet"
                disabled={busy}
                onClick={() => setAskingDelete(true)}
              >
                Delete badge
              </button>
            )
          ) : null}
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
                title: title.trim(),
                description: description.trim(),
                // Only sent when a new picture was picked.
                ...(icon ? { icon } : {}),
                active
              })
            }
          >
            {busy ? "Saving…" : badge ? "Save changes" : "Add badge"}
          </AdminButton>
        </>
      }
    >
      {error ? (
        <p className="admin-notice admin-notice--error" role="status">
          {error}
        </p>
      ) : null}

      <AdminField label="Badge name" value={title} onChange={setTitle} required />

      <div className="admin-field">
        <div className="admin-field__label">Badge picture</div>
        <div className="admin-picture-row">
          <button
            type="button"
            className="admin-badge-pick"
            disabled={busy}
            aria-label={preview ? "Replace the badge picture" : "Choose a badge picture"}
            onClick={() => inputRef.current?.click()}
          >
            {preview ? <img src={preview} alt="" /> : <BadgeIcon size={22} />}
          </button>
          <div className="admin-picture-row__side">
            <span className="admin-dropzone__file">PNG, JPEG, WebP, GIF or SVG, up to 100 KB</span>
            <div className="admin-picture-row__actions">
              <button
                type="button"
                className="admin-chip-btn"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {preview ? "Replace" : "Choose picture"}
              </button>
            </div>
          </div>
        </div>
        {pictureError ? (
          <p className="admin-field__hint admin-field__hint--error" role="status">
            {pictureError}
          </p>
        ) : null}
        <input
          ref={inputRef}
          className="admin-visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          tabIndex={-1}
          onChange={(event) => {
            takeFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      <AdminField
        label="Description"
        value={description}
        onChange={setDescription}
        multiline
        rows={3}
      />

      <div className="admin-field">
        <div className="admin-field__label">Criteria</div>
        <p className="admin-badge-criteria">Pass this lesson&apos;s quiz</p>
      </div>

      <label className="admin-check">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Enable access
      </label>
    </AdminModal>
  );
}

export default BadgeForm;
