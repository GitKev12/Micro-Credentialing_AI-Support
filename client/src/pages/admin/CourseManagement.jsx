import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCourseModule,
  deleteCourseModule,
  fetchCourse,
  fetchCourses,
  MAX_MODULE_BYTES
} from "../../services/admin";
import { moduleFileUrl } from "../../services/learningModules";
import { ChevronRightIcon, TrashIcon, UploadIcon } from "./components/icons";
import { AdminButton, BackLink, PageHeader, SearchField } from "./components/ui";

/** "2.4 MB" — the size as an admin would say it, or nothing if unrecorded. */
function fileSizeLabel(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function moduleMeta(module) {
  return [module.fileName, fileSizeLabel(module.fileSize)].filter(Boolean).join(" · ");
}

function errorMessage(error, fallback) {
  return error?.response?.data?.message || fallback;
}

/**
 * Two letters standing in for a course, taken from its code where there is
 * one. Every card used to open with the same solid maroon band, which meant a
 * quarter of the card was spent on a colour that told you nothing and looked
 * identical on all of them; a mark built from the course's own code does the
 * wayfinding that band was pretending to do.
 */
function courseMark(course) {
  const fromCode = (course.code ?? "").replace(/[^A-Za-z]/g, "");
  if (fromCode) return fromCode.slice(0, 2).toUpperCase();

  const words = (course.title ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

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

/** Title + file picker for a new lesson. Drag-and-drop or click to browse. */
function AddModuleForm({ busy, progress, onAdd }) {
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
      <h2 className="admin-card__title">Add a Learning Module</h2>

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
          Drag a PDF here, or <span className="admin-dropzone__link">browse</span>
        </span>
        <span className="admin-dropzone__file">
          {file ? `${file.name} · ${fileSizeLabel(file.size)}` : "PDF only, up to 40 MB"}
        </span>
      </button>

      <input
        ref={inputRef}
        className="admin-visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        tabIndex={-1}
        onChange={(event) => takeFile(event.target.files?.[0])}
      />

      <AdminButton variant="admin-btn--block" disabled={busy || !file} onClick={submit}>
        {busy ? `Uploading… ${progress}%` : "Add module"}
      </AdminButton>
    </section>
  );
}

function CourseManagement() {
  const [courses, setCourses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");

  // One module at a time: which is open in the preview, which is waiting on a
  // "yes, remove", and whether an add or remove is currently in flight.
  const [preview, setPreview] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let active = true;

    fetchCourses()
      .then((list) => {
        if (!active) return;
        setCourses(list);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const openCourse = (courseId) => {
    setDetailStatus("loading");
    setSelected({ id: courseId });
    setNotice(null);
    setConfirming(null);
    fetchCourse(courseId)
      .then((course) => {
        setSelected(course);
        setDetailStatus("ready");
      })
      .catch(() => setDetailStatus("error"));
  };

  const closeCourse = () => {
    setSelected(null);
    setPreview(null);
    setConfirming(null);
    setNotice(null);
  };

  /** Keeps the course card's module count in step with the detail screen. */
  const setModules = (modules) => {
    setSelected((course) => (course ? { ...course, modules } : course));
    setCourses((list) =>
      list.map((course) =>
        course.id === selected?.id ? { ...course, moduleCount: modules.length } : course
      )
    );
  };

  const addModule = async ({ file, title }) => {
    if (!file) return false;

    if (file.size > MAX_MODULE_BYTES) {
      setNotice({ tone: "error", text: "That file is larger than the 40 MB limit." });
      return false;
    }

    setBusy(true);
    setProgress(0);
    setNotice(null);
    try {
      const added = await createCourseModule(selected.id, file, {
        title,
        onProgress: setProgress
      });
      // Slot it in by title, the order the API lists modules in — appending
      // would put it last here and somewhere else after the next reload.
      const merged = [...(selected.modules ?? []), added].sort((left, right) =>
        String(left.title) < String(right.title) ? -1 : 1
      );
      setModules(merged);
      setNotice({ tone: "ok", text: `“${added.title}” was added to this course.` });
      return true;
    } catch (error) {
      setNotice({
        tone: "error",
        text: errorMessage(error, "Couldn't add the module. Check the file and try again.")
      });
      return false;
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const removeModule = async (module) => {
    setBusy(true);
    setNotice(null);
    try {
      const removed = await deleteCourseModule(module.id);
      setModules((selected.modules ?? []).filter((entry) => entry.id !== module.id));
      setConfirming(null);

      // Say what else went with it — a quiz costs money to generate again, and
      // completions are a student's record, so neither should vanish silently.
      const also = [
        removed.assessments ? `${removed.assessments} quiz` : "",
        removed.completions ? `${removed.completions} completion record` : ""
      ].filter(Boolean);
      setNotice({
        tone: "ok",
        text: `“${module.title}” was removed${also.length ? `, along with its ${also.join(" and ")}` : ""}.`
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: errorMessage(error, "Couldn't remove the module. Try again.")
      });
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter((course) =>
      `${course.title} ${course.code}`.toLowerCase().includes(term)
    );
  }, [courses, query]);

  if (selected) {
    const modules = selected.modules ?? [];

    return (
      <div className="admin-main__inner">
        <BackLink onClick={closeCourse}>Courses Management</BackLink>

        <PageHeader
          title={selected.title ?? "Course"}
          subtitle={
            detailStatus === "ready"
              ? `${selected.code} · ${modules.length} ${modules.length === 1 ? "module" : "modules"}`
              : "Loading course…"
          }
        />

        {notice ? (
          <p className={`admin-notice admin-notice--${notice.tone}`} role="status">
            {notice.text}
          </p>
        ) : null}

        <div className="admin-card">
          <h2 className="admin-card__title">Learning Modules</h2>

          {detailStatus === "loading" ? (
            <p className="admin-empty-note">Loading modules…</p>
          ) : detailStatus === "error" ? (
            <p className="admin-empty-note">Couldn&apos;t load this course.</p>
          ) : (
            <div className="admin-module-list">
              {modules.map((module) => (
                <div className="admin-module-row" key={module.id}>
                  <div className="admin-module-row__main">
                    <span className="admin-module-row__label">{module.title}</span>
                    <span className="admin-assign-row__meta">{moduleMeta(module)}</span>
                  </div>

                  {confirming === module.id ? (
                    <div className="admin-module-row__actions">
                      <span className="admin-module-row__warn">
                        Remove this module and its quiz?
                      </span>
                      <button
                        type="button"
                        className="admin-chip-btn"
                        disabled={busy}
                        onClick={() => removeModule(module)}
                      >
                        Yes, remove
                      </button>
                      <button
                        type="button"
                        className="admin-chip-btn admin-chip-btn--quiet"
                        disabled={busy}
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="admin-module-row__actions">
                      <button
                        type="button"
                        className="admin-chip-btn admin-chip-btn--quiet"
                        onClick={() => setPreview(module)}
                        aria-label={`Preview ${module.title}`}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        className="admin-chip-btn admin-chip-btn--icon"
                        disabled={busy}
                        onClick={() => setConfirming(module.id)}
                        aria-label={`Remove ${module.title}`}
                      >
                        <TrashIcon />
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {modules.length === 0 ? (
                <p className="admin-empty-note">
                  No learning modules uploaded for this course yet.
                </p>
              ) : null}
            </div>
          )}
        </div>

        {detailStatus === "ready" ? (
          <AddModuleForm busy={busy} progress={progress} onAdd={addModule} />
        ) : null}

        {preview ? <ModulePreview module={preview} onClose={() => setPreview(null)} /> : null}
      </div>
    );
  }

  return (
    <div className="admin-main__inner">
      <PageHeader
        title="Courses Management"
        subtitle="Select a course to add, preview or remove its learning modules"
      />

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search courses…"
        label="Search courses"
        hint={`${visible.length} of ${courses.length}`}
      />

      {status === "loading" ? (
        <div className="admin-state-card">Loading courses…</div>
      ) : status === "error" ? (
        <div className="admin-state-card admin-state-card--error">
          Couldn&apos;t reach the API. Check that the server is running.
        </div>
      ) : (
        <>
          <div className="admin-course-grid">
            {visible.map((course) => (
              /* An <article> with a real heading, not a <button> wrapping the
                 whole card. The card used to announce as one control whose
                 name was every word on it read end to end; now the control is
                 the title, and the counts below it are content. */
              <article className="admin-course-card" key={course.id}>
                <div className="admin-course-card__top">
                  <span className="admin-course-card__mark" aria-hidden="true">
                    {courseMark(course)}
                  </span>

                  <div className="admin-course-card__ident">
                    {course.code ? (
                      <p className="admin-course-card__code">{course.code}</p>
                    ) : null}
                    <h3 className="admin-course-card__title">
                      <button
                        type="button"
                        className="admin-course-card__open"
                        onClick={() => openCourse(course.id)}
                      >
                        {course.title}
                      </button>
                    </h3>
                  </div>

                </div>

                <p
                  className={`admin-course-card__desc${
                    course.description ? "" : " is-empty"
                  }`}
                >
                  {course.description || "No description added yet."}
                </p>

                <div className="admin-course-card__foot">
                  <p className="admin-course-card__stats">
                    {/* The one thing an admin is here to act on: a course with
                        nothing uploaded yet. A bare "0" said this before,
                        which is invisible in a grid of counts. It stands in
                        for the module count rather than sitting beside the
                        title, where it stole the width a long course name
                        needs. */}
                    {course.moduleCount === 0 ? (
                      <span className="admin-count--none">No modules</span>
                    ) : (
                      <span className="admin-course-card__stat">
                        <strong>{course.moduleCount}</strong> modules
                      </span>
                    )}
                    <span className="admin-course-card__sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="admin-course-card__stat">
                      <strong>{course.studentCount}</strong> students
                    </span>
                  </p>

                  {/* Affordance only — the title button is the control, so
                      this must not be read out as a second one. */}
                  <span className="admin-course-card__manage" aria-hidden="true">
                    Manage
                    <ChevronRightIcon size={14} />
                  </span>
                </div>
              </article>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="admin-empty-note">No courses match your search.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

export default CourseManagement;
