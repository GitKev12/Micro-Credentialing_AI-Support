import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCourse,
  createCourseModule,
  deleteCourse,
  deleteCourseModule,
  fetchCourse,
  fetchCourseImpact,
  fetchCourses,
  fetchModuleImpact,
  removeCourseImage,
  updateCourse,
  uploadCourseImage,
  MAX_COURSE_IMAGE_BYTES,
  MAX_MODULE_BYTES
} from "../../services/admin";
import { moduleFileUrl } from "../../services/learningModules";
import { courseImageUrl } from "../../services/courses";
import { sortedLessons } from "../../lib/lessonOrder";
import { formatCourseRun, isRunInOrder, toDateInput } from "../../lib/courseDuration";
import { CheckIcon, ChevronRightIcon, TrashIcon, UploadIcon } from "./components/icons";
import RangeCalendar from "./components/RangeCalendar";
import {
  AdminButton,
  AdminField,
  AdminModal,
  BackLink,
  ConfirmDeleteModal,
  PageHeader,
  SearchField
} from "./components/ui";
import { SkeletonTable, SkeletonText } from "../../components/Skeleton";

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

/** "1 lesson" / "3 lessons" — a count that reads as English. */
function plural(count, word, suffix = "s") {
  return `${count} ${word}${count === 1 ? "" : suffix}`;
}

/**
 * What deleting a course destroys, and what survives it.
 *
 * The distinction is the point of the dialog: lessons and submissions go, but a
 * student is not the course's to delete — they are unenrolled and keep their
 * account. Saying only the first half would make this look like it removes
 * people.
 */
function courseLosses(impact) {
  if (!impact) return null;
  if (impact.unknown) {
    return [
      "its lessons, with their files and quizzes",
      "any completions and submissions recorded in it",
      "its Table of Specification blueprint"
    ];
  }

  return [
    impact.modules ? `${plural(impact.modules, "lesson")}, with their files and quizzes` : "",
    impact.completions ? plural(impact.completions, "lesson completion") : "",
    impact.submissions ? plural(impact.submissions, "quiz submission") : "",
    impact.blueprints ? "its Table of Specification blueprint" : ""
  ].filter(Boolean);
}

function courseKeeps(impact) {
  if (!impact || impact.unknown) return [];

  return [
    impact.enrolled
      ? `${plural(impact.enrolled, "student")} — unenrolled, but their account and records stay`
      : "",
    impact.assessors
      ? `${plural(impact.assessors, "assessor")} — unassigned, but their account stays`
      : ""
  ].filter(Boolean);
}

/** "a, b and c" — an English list, not a comma-separated dump. */
function listWords(items) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * What removing this lesson would destroy, named before the admin agrees to it.
 *
 * The confirm used to say "this module and its quiz". Deleting a module also
 * deletes every completion recorded against it — a student's evidence that they
 * did the work — and that was reported afterwards, in the success message.
 * Being told after the fact is not consent, so the counts are read first and
 * spelled out here.
 */
function impactLabel(impact) {
  if (!impact) return "Checking what this would remove…";
  // The count failed. Name the categories anyway: silence would read as
  // "nothing else will be lost", which is the one thing we cannot claim.
  if (impact.unknown) return "Remove this module, its quiz and any completion records?";

  const losses = [
    impact.assessments ? `${impact.assessments} quiz${impact.assessments === 1 ? "" : "zes"}` : "",
    impact.completions
      ? `${impact.completions} completion record${impact.completions === 1 ? "" : "s"}`
      : "",
    impact.figures ? `${impact.figures} figure${impact.figures === 1 ? "" : "s"}` : ""
  ].filter(Boolean);

  if (losses.length === 0) return "Remove this module? Nothing else depends on it.";
  return `Remove this module, ${listWords(losses)}? This cannot be undone.`;
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

/**
 * Create or rename a course.
 *
 * One form for both: the fields are identical and the only difference is
 * whether it opens empty, so two nearly-identical components would be two
 * places to fix the next time a field is added.
 */
function CourseForm({ course, busy, error, onCancel, onSave }) {
  const editing = Boolean(course);
  const [code, setCode] = useState(course?.code ?? "");
  const [title, setTitle] = useState(course?.title ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [startsOn, setStartsOn] = useState(toDateInput(course?.startsOn));
  const [endsOn, setEndsOn] = useState(toDateInput(course?.endsOn));

  // A course runs between two dates, so both are wanted and in that order.
  // The courses stored before the field existed have neither; the form insists
  // on them the first time one of those is opened for editing.
  // The calendar cannot express an inverted run, but a course stored before it
  // existed can still hold one, so the guard stays — it is the rule the server
  // enforces, not a message about what was just typed.
  const orderedRun = isRunInOrder(startsOn, endsOn);
  const wholeRun = Boolean(startsOn && endsOn);
  const ready = code.trim() && title.trim() && wholeRun && orderedRun;

  return (
    <AdminModal
      title={editing ? "Edit course" : "New course"}
      subtitle={editing ? course.code : null}
      onClose={onCancel}
      footer={
        <>
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
                code: code.trim(),
                title: title.trim(),
                description: description.trim(),
                // Sent even when blank: an empty string is how the admin
                // clears a date they set earlier.
                startsOn,
                endsOn
              })
            }
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Create course"}
          </AdminButton>
        </>
      }
    >
      {error ? (
        <p className="admin-notice admin-notice--error" role="status">
          {error}
        </p>
      ) : null}

      <AdminField
        label="Course code"
        value={code}
        onChange={setCode}
        placeholder="e.g. CC2"
        required
      />
      <AdminField
        label="Course title"
        value={title}
        onChange={setTitle}
        placeholder="e.g. Computer Programming 2"
        required
      />
      <AdminField
        label="Description"
        value={description}
        onChange={setDescription}
        placeholder="What this course covers"
        multiline
        rows={5}
      />

      {/* One field, because the two dates are one fact: the run. As a pair of
          native date inputs they were picked in separate browser popups that
          could not show the span between them, and the end could be set before
          the start and only told off afterwards. On a grid the span is the
          thing being drawn, and an inverted run cannot be expressed. */}
      <RangeCalendar
        startsOn={startsOn}
        endsOn={endsOn}
        required
        onChange={(run) => {
          setStartsOn(run.startsOn);
          setEndsOn(run.endsOn);
        }}
      />
    </AdminModal>
  );
}

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
      <h2 className="admin-card__title">Course Picture</h2>

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
  // What that module's removal would destroy, fetched when the confirm opens.
  // Null while it is still loading, so the confirm can hold its tongue rather
  // than claim there is nothing to lose before it has looked.
  const [impact, setImpact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState(null);

  // The course itself, rather than its lessons: which form is open ("new", or
  // the course being edited), and the deletion waiting on its impact count.
  const [imageBusy, setImageBusy] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const [courseForm, setCourseForm] = useState(null);
  const [formError, setFormError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [courseImpact, setCourseImpact] = useState(null);

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

  const saveCourse = async (values) => {
    setBusy(true);
    setFormError(null);
    try {
      if (courseForm === "new") {
        const created = await createCourse(values);
        setCourses((list) => [...list, created]);
        setNotice({ tone: "ok", text: `“${created.title}” was created.` });
      } else {
        const saved = await updateCourse(courseForm.id, values);
        setCourses((list) => list.map((c) => (c.id === saved.id ? { ...c, ...saved } : c)));
        setSelected((course) => (course ? { ...course, ...saved } : course));
        setNotice({ tone: "ok", text: `“${saved.title}” was updated.` });
      }
      setCourseForm(null);
    } catch (error) {
      // Stays inside the form: the code clash and the missing title are both
      // things the admin fixes in a field they are still looking at.
      setFormError(errorMessage(error, "Couldn't save this course. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const askToDeleteCourse = (course) => {
    setDeleting(course);
    setCourseImpact(null);
    fetchCourseImpact(course.id)
      .then(setCourseImpact)
      .catch(() => setCourseImpact({ unknown: true }));
  };

  const removeCourse = async () => {
    setBusy(true);
    try {
      const removed = await deleteCourse(deleting.id);
      setCourses((list) => list.filter((c) => c.id !== deleting.id));
      setDeleting(null);
      setCourseImpact(null);
      closeCourse();
      setNotice({
        tone: "ok",
        text: `“${removed.title}” was deleted, along with ${removed.modules} lesson${
          removed.modules === 1 ? "" : "s"
        }.`
      });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error, "Couldn't delete this course.") });
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  const setCourseImage = async (file) => {
    setImageBusy(true);
    setImageProgress(0);
    try {
      const image = await uploadCourseImage(selected.id, file, { onProgress: setImageProgress });
      setSelected((course) =>
        course ? { ...course, hasImage: true, imageUpdatedAt: image.imageUpdatedAt } : course
      );
      // The catalog card carries hasImage too, so it does not fall out of step
      // with the detail screen the admin just left.
      setCourses((list) =>
        list.map((course) =>
          course.id === selected.id
            ? { ...course, hasImage: true, imageUpdatedAt: image.imageUpdatedAt }
            : course
        )
      );
      setNotice({ tone: "ok", text: "The course picture was updated." });
    } catch (error) {
      setNotice({
        tone: "error",
        text: errorMessage(error, "Couldn't upload that picture. Try again.")
      });
    } finally {
      setImageBusy(false);
      setImageProgress(0);
    }
  };

  const clearCourseImage = async () => {
    setImageBusy(true);
    try {
      await removeCourseImage(selected.id);
      setSelected((course) =>
        course ? { ...course, hasImage: false, imageUpdatedAt: null } : course
      );
      setCourses((list) =>
        list.map((course) =>
          course.id === selected.id
            ? { ...course, hasImage: false, imageUpdatedAt: null }
            : course
        )
      );
      setNotice({ tone: "ok", text: "The course picture was removed." });
    } catch (error) {
      setNotice({
        tone: "error",
        text: errorMessage(error, "Couldn't remove that picture. Try again.")
      });
    } finally {
      setImageBusy(false);
    }
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
      // Slot it in by lesson number, the order the API lists modules in —
      // appending would put it last here and somewhere else after the next
      // reload, and "Chapter 10" is not the last chapter.
      setModules(sortedLessons([...(selected.modules ?? []), added]));
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

  /**
   * Opens the confirmation, then fills in what it would cost.
   *
   * The counts are fetched rather than assumed: "and its quiz" was true of some
   * modules and badly incomplete for others, and the difference is whether any
   * student has worked through it.
   */
  const askToRemove = (module) => {
    setConfirming(module.id);
    setImpact(null);
    fetchModuleImpact(module.id)
      .then(setImpact)
      // A failed count must not read as "nothing will be lost". The confirm
      // falls back to naming the categories without numbers.
      .catch(() => setImpact({ unknown: true }));
  };

  const removeModule = async (module) => {
    setBusy(true);
    setNotice(null);
    try {
      const removed = await deleteCourseModule(module.id);
      setModules((selected.modules ?? []).filter((entry) => entry.id !== module.id));
      setConfirming(null);
      setImpact(null);

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
              ? [
                  selected.code,
                  `${modules.length} ${modules.length === 1 ? "module" : "modules"}`,
                  formatCourseRun(selected)
                ]
                  .filter(Boolean)
                  .join(" · ")
              : // The card below is already drawing a skeleton and saying so;
                // a second "loading" line under the title would be the same
                // message twice on one screen.
                null
          }
          action={
            detailStatus === "ready" ? (
              <div className="admin-header__actions">
                <button
                  type="button"
                  className="admin-chip-btn admin-chip-btn--quiet"
                  disabled={busy}
                  onClick={() => {
                    setFormError(null);
                    setCourseForm(selected);
                  }}
                >
                  Edit course
                </button>
                <button
                  type="button"
                  className="admin-chip-btn admin-chip-btn--danger"
                  disabled={busy}
                  onClick={() => askToDeleteCourse(selected)}
                >
                  Delete
                </button>
              </div>
            ) : null
          }
        />

        {notice ? (
          <p className={`admin-notice admin-notice--${notice.tone}`} role="status">
            {notice.text}
          </p>
        ) : null}

        {/* Two columns on the detail: the module list reads down the left, and
            the upload panel sits to its right where it is always in reach —
            rather than below a list that grows and pushes it off-screen. */}
        <div className="admin-grid-detail">
          <div className="admin-card">
            <h2 className="admin-card__title">Learning Modules</h2>

            {detailStatus === "loading" ? (
              <SkeletonText lines={4} label="Loading modules…" />
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
                        <span className="admin-module-row__warn">{impactLabel(impact)}</span>
                        {/* Held back until the counts are in: agreeing to a
                            removal whose cost is still loading is agreeing to
                            nothing in particular. */}
                        <button
                          type="button"
                          className="admin-chip-btn"
                          disabled={busy || !impact}
                          onClick={() => removeModule(module)}
                        >
                          Yes, remove
                        </button>
                        <button
                          type="button"
                          className="admin-chip-btn admin-chip-btn--quiet"
                          disabled={busy}
                          onClick={() => {
                            setConfirming(null);
                            setImpact(null);
                          }}
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
                          onClick={() => askToRemove(module)}
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
            <div className="admin-stack">
              <AddModuleForm busy={busy} progress={progress} onAdd={addModule} />
              <CourseImageForm
                course={selected}
                busy={imageBusy}
                progress={imageProgress}
                onUpload={setCourseImage}
                onRemove={clearCourseImage}
              />
            </div>
          ) : null}
        </div>

        {preview ? <ModulePreview module={preview} onClose={() => setPreview(null)} /> : null}

        {courseForm ? (
          <CourseForm
            course={courseForm === "new" ? null : courseForm}
            busy={busy}
            error={formError}
            onCancel={() => setCourseForm(null)}
            onSave={saveCourse}
          />
        ) : null}

        {deleting ? (
          <ConfirmDeleteModal
            title="Delete this course?"
            subject={`${deleting.code} · ${deleting.title}`}
            losses={courseLosses(courseImpact)}
            keeps={courseKeeps(courseImpact)}
            busy={busy}
            confirmLabel="Delete course"
            onCancel={() => {
              setDeleting(null);
              setCourseImpact(null);
            }}
            onConfirm={removeCourse}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="admin-main__inner">
      <PageHeader title="Courses Management" />

      {/* A deletion closes the detail screen, so its result has to land
          here — the notice inside the detail view would never be seen. It
          rides the search row rather than a line of its own, so arriving and
          clearing does not shunt the table down and back. */}
      <div className="admin-toolbar">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search courses…"
          label="Search courses"
          hint={`${visible.length} of ${courses.length}`}
        />

        <AdminButton
          variant="admin-toolbar__action"
          onClick={() => {
            setFormError(null);
            setCourseForm("new");
          }}
        >
          New course
        </AdminButton>

        {notice ? (
          <p
            className={`admin-notice admin-notice--inline admin-notice--${notice.tone}`}
            role="status"
          >
            {notice.tone === "ok" ? (
              <span className="admin-notice__icon">
                <CheckIcon size={14} />
              </span>
            ) : null}
            {notice.text}
          </p>
        ) : null}
      </div>

      {status === "loading" ? (
        <SkeletonTable rows={6} cols={5} label="Loading courses…" />
      ) : status === "error" ? (
        <div className="admin-state-card admin-state-card--error">
          Couldn&apos;t reach the API. Check that the server is running.
        </div>
      ) : (
        <>
          {/* The same list every other management screen draws: one row per
              course, columns that line up down the page, and the counts in a
              column rather than in a sentence at the foot of a card. A grid of
              cards read well one at a time and badly as a catalogue — nothing
              could be compared without hopping between two footers. */}
          <div className="admin-table-card">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Duration</th>
                  <th className="is-center">Modules</th>
                  <th className="is-center">Students</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {visible.map((course) => (
                  <tr key={course.id} onClick={() => openCourse(course.id)}>
                    <td>
                      <div className="admin-person">
                        <span className="admin-avatar admin-avatar--course" aria-hidden="true">
                          {courseMark(course)}
                        </span>
                        <div>
                          {/* The title is the control. The row click stays a
                              mouse convenience, but a <tr> takes no focus, so
                              without this the only keyboard path in would be
                              the chevron at the far end. */}
                          <button
                            type="button"
                            className="admin-person__name admin-person__link"
                            onClick={(event) => {
                              event.stopPropagation();
                              openCourse(course.id);
                            }}
                          >
                            {course.title}
                          </button>
                          {course.code ? (
                            <div className="admin-person__id">{course.code}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="admin-cell__quiet">
                        {formatCourseRun(course) ?? "Not set"}
                      </span>
                    </td>
                    {/* The one thing an admin is here to act on: a course with
                        nothing uploaded yet. A bare "0" is invisible in a
                        column of counts. */}
                    <td className="is-center">
                      {course.moduleCount === 0 ? (
                        <span className="admin-count admin-count--none">None</span>
                      ) : (
                        <span className="admin-count">{course.moduleCount}</span>
                      )}
                    </td>
                    <td className="is-center">
                      <strong className="admin-strong-brand">{course.studentCount}</strong>
                    </td>
                    <td className="admin-table__chevron">
                      <span className="admin-table__cue" aria-hidden="true">
                        <ChevronRightIcon size={15} />
                      </span>
                    </td>
                  </tr>
                ))}

                {visible.length === 0 ? (
                  <tr className="admin-table__empty">
                    <td colSpan={5}>No courses match your search.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* "New course" is a list-screen action, so its form belongs here too. */}
      {courseForm === "new" ? (
        <CourseForm
          course={null}
          busy={busy}
          error={formError}
          onCancel={() => setCourseForm(null)}
          onSave={saveCourse}
        />
      ) : null}
    </div>
  );
}

export default CourseManagement;
