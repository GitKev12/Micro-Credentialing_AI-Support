import { useRef, useState } from "react";

import { PlusIcon, UploadIcon } from "../icons";
import { AdminButton, SectionTitle } from "../ui";
import { fileSizeLabel } from "../../lib/format";

/** Title + file picker for a new lesson. Drag-and-drop or click to browse. */
function AddModuleForm({ nextNumber, busy, progress, onAdd }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const takeFile = (chosen) => {
    if (!chosen) return;
    setFile(chosen);
    // The file name is the obvious first draft of the title; the admin can
    // still type over it before adding.
    if (!title.trim()) setTitle(chosen.name.replace(/\.pdf$/i, ""));
  };

  const submit = async () => {
    const added = await onAdd({ file, title: title.trim() });
    if (added) {
      setTitle("");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section className="admin-card admin-card--stacked">
      <div className="admin-lessons__head">
        <SectionTitle icon={PlusIcon}>Add a Learning Module</SectionTitle>
        {/* Carries on the numbering of the list beside it. */}
        <span className="admin-lessons__count">Lesson {nextNumber}</span>
      </div>

      {/* The file comes first: its name is the first draft of the title. */}
      <button
        type="button"
        className={`admin-dropzone${dragging ? " is-dragging" : ""}${file ? " has-file" : ""}`}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          takeFile(event.dataTransfer.files?.[0]);
        }}
      >
        {file ? (
          <>
            <span className="admin-dropzone__doc" aria-hidden="true">
              PDF
            </span>
            <span className="admin-dropzone__chosen">
              <span className="admin-dropzone__name">{file.name}</span>
              <span className="admin-dropzone__file">
                {fileSizeLabel(file.size)}
                <span className="admin-dropzone__link">Change</span>
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="admin-dropzone__icon">
              <UploadIcon size={22} />
            </span>
            <span className="admin-dropzone__text">
              Drag a PDF here, or <span className="admin-dropzone__link">browse</span>
            </span>
            <span className="admin-dropzone__file">PDF only, up to 40 MB</span>
          </>
        )}
        {busy && file ? (
          <span className="admin-dropzone__bar" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </span>
        ) : null}
      </button>

      <input
        ref={inputRef}
        className="admin-visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        tabIndex={-1}
        onChange={(event) => takeFile(event.target.files?.[0])}
      />

      <div className="admin-field">
        <div className="admin-field__label">Module title</div>
        <input
          className="admin-input"
          type="text"
          value={title}
          placeholder="e.g. Chapter 3 — Data Representation"
          aria-label="Module title"
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <AdminButton variant="admin-btn--block" disabled={busy || !file} onClick={submit}>
        {busy ? `Uploading… ${progress}%` : "Add module"}
      </AdminButton>
    </section>
  );
}

export default AddModuleForm;
