import { useRef, useState } from "react";

import { PlusIcon, UploadIcon } from "../icons";
import { AdminButton, SectionTitle } from "../ui";
import { fileSizeLabel, plural } from "../../lib/format";

// Keep only PDFs from what was picked or dropped.
const onlyPdfs = (fileList) =>
  [...(fileList ?? [])].filter(
    (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name)
  );

/** Title + file picker for new lessons. Pick or drop one PDF or several. */
function AddModuleForm({ nextNumber, busy, progress, step, onAdd }) {
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const single = files.length === 1;

  const takeFiles = (fileList) => {
    const chosen = onlyPdfs(fileList);
    if (chosen.length === 0) return;
    setFiles(chosen);
    // One file: its name is the first draft of the title.
    // Several files: each one is titled from its own name.
    setTitle(chosen.length === 1 ? chosen[0].name.replace(/\.pdf$/i, "") : "");
  };

  const submit = async () => {
    const done = await onAdd({ files, title: single ? title.trim() : "" });
    if (done) {
      setTitle("");
      setFiles([]);
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
        className={`admin-dropzone${dragging ? " is-dragging" : ""}${files.length ? " has-file" : ""}`}
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
          takeFiles(event.dataTransfer.files);
        }}
      >
        {files.length ? (
          <>
            <span className="admin-dropzone__doc" aria-hidden="true">
              PDF
            </span>
            <span className="admin-dropzone__chosen">
              <span className="admin-dropzone__name">
                {single ? files[0].name : plural(files.length, "file")}
              </span>
              <span className="admin-dropzone__file">
                {fileSizeLabel(files.reduce((sum, file) => sum + file.size, 0))}
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
              Drag PDFs here, or <span className="admin-dropzone__link">browse</span>
            </span>
            <span className="admin-dropzone__file">PDF only, up to 40 MB each</span>
          </>
        )}
        {busy && files.length ? (
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
        multiple
        tabIndex={-1}
        onChange={(event) => takeFiles(event.target.files)}
      />

      {single ? (
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
      ) : null}

      {/* Several files: each becomes a module named after its file. */}
      {files.length > 1 ? (
        <ul className="admin-upload-list" aria-label="Files to add">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}`} className="admin-upload-list__item">
              {/* title: hover to read a long name that was cut off */}
              <span className="admin-upload-list__name" title={file.name}>
                {file.name.replace(/\.pdf$/i, "")}
              </span>
              <span className="admin-upload-list__size">{fileSizeLabel(file.size)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <AdminButton variant="admin-btn--block" disabled={busy || files.length === 0} onClick={submit}>
        {busy
          ? step && step.total > 1
            ? `Uploading ${step.index} of ${step.total}… ${progress}%`
            : `Uploading… ${progress}%`
          : files.length > 1
            ? `Add ${plural(files.length, "module")}`
            : "Add module"}
      </AdminButton>
    </section>
  );
}

export default AddModuleForm;
