import { useRef, useState } from "react";

import { MAX_COURSE_IMAGE_BYTES } from "../../../../services/admin";
import { courseImageUrl } from "../../../../services/courses";
import { ImageIcon, UploadIcon } from "../icons";
import { SectionTitle } from "../ui";
import { fileSizeLabel } from "../../lib/format";

/**
 * The picture behind the course's card on the student's dashboard.
 *
 * One picture per course, so this is a replace rather than a list: choosing a
 * file uploads it immediately — there is no second field to fill in and no
 * reason to make the admin press Save for a decision they have already made by
 * picking the file.
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
    <section className="admin-card admin-card--stacked">
      <SectionTitle icon={ImageIcon}>Course Picture</SectionTitle>

      {course.hasImage ? (
        <img
          className="admin-course-image"
          src={courseImageUrl(course.id, course.imageUpdatedAt)}
          alt={`Current picture for ${course.title}`}
        />
      ) : null}

      {error ? (
        <p className="admin-notice admin-notice--error" role="status">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className={`admin-dropzone${dragging ? " is-dragging" : ""}`}
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
        <span className="admin-dropzone__icon">
          <UploadIcon />
        </span>
        <span className="admin-dropzone__text">
          {course.hasImage ? "Drop a replacement here, or " : "Drag a picture here, or "}
          <span className="admin-dropzone__link">browse</span>
        </span>
        <span className="admin-dropzone__file">
          {busy ? `Uploading… ${progress}%` : "PNG, JPEG, WebP or GIF, up to 5 MB"}
        </span>
      </button>

      <input
        ref={inputRef}
        className="admin-visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        tabIndex={-1}
        onChange={(event) => takeFile(event.target.files?.[0])}
      />

      {course.hasImage ? (
        <button
          type="button"
          className="admin-chip-btn admin-chip-btn--quiet"
          disabled={busy}
          onClick={onRemove}
        >
          Remove picture
        </button>
      ) : null}
    </section>
  );
}

export default CourseImageForm;
