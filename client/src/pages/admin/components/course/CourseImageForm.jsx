import { useRef, useState } from "react";

import { MAX_COURSE_IMAGE_BYTES } from "../../../../services/admin";
import { courseImageUrl } from "../../../../services/courses";
import { ImageIcon } from "../icons";
import { fileSizeLabel } from "../../lib/format";

/**
 * The course picture, as a small row inside Edit Course.
 * Picking a file uploads it straight away; it doesn't wait for Save.
 */
function CourseImageForm({ course, busy, progress, onUpload, onRemove }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const takeFile = (chosen) => {
    if (!chosen) return;
    setError(null);

    if (chosen.size > MAX_COURSE_IMAGE_BYTES) {
      setError(`That picture is ${fileSizeLabel(chosen.size)} — the limit is 5 MB.`);
      return;
    }

    onUpload(chosen);
    // Cleared so picking the same file twice still counts as a choice.
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="admin-field">
      <div className="admin-field__label">Course picture</div>

      <div className="admin-picture-row">
        {/* The thumbnail is also a drop target. */}
        <button
          type="button"
          className={`admin-picture admin-picture--compact${course.hasImage ? " has-image" : ""}${
            dragging ? " is-dragging" : ""
          }`}
          disabled={busy}
          aria-label={course.hasImage ? "Replace the course picture" : "Upload a course picture"}
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
          {course.hasImage ? (
            <img
              className="admin-picture__img"
              src={courseImageUrl(course.id, course.imageUpdatedAt)}
              alt=""
            />
          ) : (
            <ImageIcon size={20} />
          )}
          {busy ? (
            <span className="admin-dropzone__bar" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </span>
          ) : null}
        </button>

        <div className="admin-picture-row__side">
          <span className="admin-dropzone__file">
            {busy ? `Uploading… ${progress}%` : "PNG, JPEG, WebP or GIF, up to 5 MB"}
          </span>
          <div className="admin-picture-row__actions">
            <button
              type="button"
              className="admin-chip-btn"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {course.hasImage ? "Replace" : "Upload"}
            </button>
            {course.hasImage ? (
              <button
                type="button"
                className="admin-chip-btn admin-chip-btn--quiet"
                disabled={busy}
                onClick={onRemove}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <p className="admin-field__hint admin-field__hint--error" role="status">
          {error}
        </p>
      ) : null}

      <input
        ref={inputRef}
        className="admin-visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        tabIndex={-1}
        onChange={(event) => takeFile(event.target.files?.[0])}
      />
    </div>
  );
}

export default CourseImageForm;
