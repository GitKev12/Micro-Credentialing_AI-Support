import { useRef, useState } from "react";

import { CloseIcon, UploadIcon } from "../icons";
import { fileSizeLabel } from "../../lib/format";

// True for a PDF, by type or by name.
const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** One module added with "+ Module" but not uploaded yet. */
function DraftRow({ draft, number, busy, uploading, progress, onChange, onUpload, onDiscard }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  // Take the first PDF; its name fills an empty title.
  const takeFile = (fileList) => {
    const file = [...(fileList ?? [])].find(isPdf);
    if (!file) return;
    onChange({ file, title: draft.title || file.name.replace(/\.pdf$/i, "") });
  };

  return (
    <li
      className={`admin-lesson admin-lesson--draft${dragging ? " is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        takeFile(event.dataTransfer.files);
      }}
    >
      <span className="admin-lesson__num" aria-hidden="true">
        {number}
      </span>

      <div className="admin-lesson__main">
        <input
          className="admin-lesson__title-input"
          type="text"
          value={draft.title}
          placeholder="Module title"
          aria-label={`Lesson ${number} title`}
          disabled={uploading}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <span className="admin-lesson__meta">
          {uploading
            ? `Uploading… ${progress}%`
            : draft.file
              ? `${draft.file.name} · ${fileSizeLabel(draft.file.size)}`
              : "No PDF yet"}
        </span>
        {uploading ? (
          <span className="admin-lesson__bar" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </span>
        ) : null}
      </div>

      <div className="admin-lesson__actions">
        <button
          type="button"
          className="admin-chip-btn admin-chip-btn--quiet"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {draft.file ? "Change PDF" : "Choose PDF"}
        </button>
        <button
          type="button"
          className="admin-chip-btn"
          disabled={busy || !draft.file || !draft.title.trim()}
          onClick={onUpload}
        >
          <UploadIcon size={14} />
          Upload
        </button>
        <button
          type="button"
          className="admin-lesson__remove"
          disabled={uploading}
          onClick={onDiscard}
          aria-label={`Discard lesson ${number}`}
          title="Discard"
        >
          <CloseIcon size={14} />
        </button>
      </div>

      <input
        ref={inputRef}
        className="admin-visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        tabIndex={-1}
        onChange={(event) => {
          takeFile(event.target.files);
          event.target.value = "";
        }}
      />
    </li>
  );
}

/**
 * The modules waiting to be uploaded. Kept in their own list under the
 * uploaded ones, numbered on from them.
 */
export default function ModuleDrafts({ drafts, firstNumber, busy, progress, uploadingId, onChange, onUpload, onDiscard }) {
  if (drafts.length === 0) return null;

  return (
    <ol className="admin-lesson-drafts" aria-label="Modules not uploaded yet">
      {drafts.map((draft, index) => (
        <DraftRow
          key={draft.id}
          draft={draft}
          number={firstNumber + index}
          busy={busy}
          uploading={uploadingId === draft.id}
          progress={progress}
          onChange={(changes) => onChange(draft.id, changes)}
          onUpload={() => onUpload(draft)}
          onDiscard={() => onDiscard(draft.id)}
        />
      ))}
    </ol>
  );
}
