import { useEffect, useMemo, useState } from "react";
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
  MAX_MODULE_BYTES
} from "../../services/admin";
import { sortedLessons } from "../../lib/lessonOrder";
import { formatCourseRun } from "../../lib/courseDuration";
import { ChevronRightIcon, CoursesIcon } from "./components/icons";
import { AdminButton, BackLink, ConfirmDeleteModal, PageHeader, SearchField } from "./components/ui";
import AddModuleForm from "./components/course/AddModuleForm";
import CourseForm from "./components/course/CourseForm";
import CourseImageForm from "./components/course/CourseImageForm";
import ModuleList from "./components/course/ModuleList";
import ModulePreview from "./components/course/ModulePreview";
import { courseKeeps, courseLosses, courseMark } from "./components/course/impact";
import { errorMessage } from "./lib/format";
import { SkeletonTable } from "../../components/Skeleton";
import { useLatestRequest } from "../../lib/useLatestRequest";
import { useNotice } from "../../lib/useNotice";

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
  const [notice, setNotice] = useNotice();

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

  const detailRequest = useLatestRequest();
  const impactRequest = useLatestRequest();
  // Its own guard: the module confirm sits inline in a row and the course
  // confirm is a dialog, so both can be open at the same time.
  const moduleImpactRequest = useLatestRequest();

  const openCourse = (courseId) => {
    // Claimed before the fetch, so a slower reply for a record the
    // admin has already clicked past is dropped rather than shown.
    const token = detailRequest.next();
    setDetailStatus("loading");
    setSelected({ id: courseId });
    setNotice(null);
    setConfirming(null);
    fetchCourse(courseId)
      .then((course) => {
        if (!detailRequest.isCurrent(token)) return;
        setSelected(course);
        setDetailStatus("ready");
      })
      .catch(() => {
        if (detailRequest.isCurrent(token)) setDetailStatus("error");
      });
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
    // The costs are read for one record; a reply that arrives after the
    // admin has cancelled and opened another must not fill in that one.
    const token = impactRequest.next();
    setDeleting(course);
    setCourseImpact(null);
    fetchCourseImpact(course.id)
      .then((data) => {
        if (impactRequest.isCurrent(token)) setCourseImpact(data);
      })
      .catch(() => {
        if (impactRequest.isCurrent(token)) setCourseImpact({ unknown: true });
      });
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
    // The costs are read for one record; a reply that arrives after the
    // admin has cancelled and opened another must not fill in that one.
    const token = moduleImpactRequest.next();
    setConfirming(module.id);
    setImpact(null);
    fetchModuleImpact(module.id)
      .then((data) => {
        if (moduleImpactRequest.isCurrent(token)) setImpact(data);
      })
      // A failed count must not read as "nothing will be lost". The confirm
      // falls back to naming the categories without numbers.
      .catch(() => {
        if (moduleImpactRequest.isCurrent(token)) setImpact({ unknown: true });
      });
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
          icon={CoursesIcon}
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
          <ModuleList
            modules={modules}
            detailStatus={detailStatus}
            busy={busy}
            confirming={confirming}
            impact={impact}
            onPreview={setPreview}
            onAskRemove={askToRemove}
            onRemove={removeModule}
            onCancelRemove={() => {
              setConfirming(null);
              setImpact(null);
            }}
          />

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
      <PageHeader title="Courses Management" icon={CoursesIcon} />

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
          notice={notice}
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
