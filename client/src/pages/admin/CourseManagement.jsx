import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  createCourse,
  createCourseModule,
  deleteCourse,
  deleteCourseModule,
  deleteModuleBadge,
  fetchCourse,
  fetchCourseImpact,
  fetchCourses,
  fetchModuleImpact,
  removeCourseImage,
  saveModuleBadge,
  setCourseStatus,
  updateCourse,
  uploadCourseImage,
  MAX_MODULE_BYTES
} from "../../services/admin";
import { sortedLessons } from "../../lib/lessonOrder";
import { formatCourseRun } from "../../lib/courseDuration";
import { CoursesIcon } from "./components/icons";
import {
  AdminButton,
  BackLink,
  ConfirmDeleteModal,
  FILTER_ALL,
  ListFilter,
  PageHeader,
  passesFilter,
  SearchField,
  StatusMenu,
  Pagination,
  usePagination
} from "./components/ui";
import BadgeForm from "./components/course/BadgeForm";
import CourseForm from "./components/course/CourseForm";
import CourseHeader from "./components/course/CourseHeader";
import CourseImageForm from "./components/course/CourseImageForm";
import ModuleList from "./components/course/ModuleList";
import ModulePreview from "./components/course/ModulePreview";
import { courseMark } from "./components/course/impact";
import { errorMessage, plural } from "./lib/format";
import { SkeletonTable } from "../../components/Skeleton";
import { useLatestRequest } from "../../lib/useLatestRequest";
import { courseKeeps, courseLosses } from "./lib/deleteText";
import { noticeClass, useNotice } from "../../lib/useNotice";

function CourseManagement() {
  const location = useLocation();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  // The categories other courses already use, offered on the course form.
  const categories = useMemo(
    () => [...new Set(courses.map((course) => course.category).filter(Boolean))].sort(),
    [courses]
  );
  // Status filter. Archived courses only show when "Archived" is picked.
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL);

  const [selected, setSelected] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");

  // One module at a time: which is open in the preview, which is waiting on a
  // "yes, remove", and whether an add or remove is currently in flight.
  const [preview, setPreview] = useState(null);
  const [confirming, setConfirming] = useState(null);
  // The archived course being deleted, what it would remove, and any refusal.
  const [deleting, setDeleting] = useState(null);
  const [courseImpact, setCourseImpact] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const courseImpactRequest = useLatestRequest();
  // What that module's removal would destroy, fetched when the confirm opens.
  // Null while it is still loading, so the confirm can hold its tongue rather
  // than claim there is nothing to lose before it has looked.
  const [impact, setImpact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  // Which file is uploading when several were picked: { index, total }.
  const [notice, setNotice] = useNotice();

  // The course itself, rather than its lessons: which form is open ("new", or
  // the course being edited).
  const [imageBusy, setImageBusy] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const [courseForm, setCourseForm] = useState(null);
  // The lesson whose badge is being added or edited.
  const [badgeFor, setBadgeFor] = useState(null);
  const [badgeBusy, setBadgeBusy] = useState(false);
  const [badgeError, setBadgeError] = useState(null);
  const [formError, setFormError] = useState(null);

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

  // Coming back from a lesson's Pre-Assessment page: open that course again.
  const returnTo = location.state?.openCourseId;
  useEffect(() => {
    if (returnTo) openCourse(returnTo);
    // Only when the page is opened with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnTo]);

  const openPreAssessment = (module) =>
    navigate(`/admin/courses/${selected.id}/lessons/${module.id}/pre-assessment`);

  const closeCourse = () => {
    setSelected(null);
    setPreview(null);
    setBadgeFor(null);
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
      // Shown inside Edit Course, where the picture is changed.
      setFormError(errorMessage(error, "Couldn't upload that picture. Try again."));
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
      // Shown inside Edit Course, where the picture is changed.
      setFormError(errorMessage(error, "Couldn't remove that picture. Try again."));
    } finally {
      setImageBusy(false);
    }
  };

  const openBadge = (module) => {
    setBadgeError(null);
    setBadgeFor(module);
  };

  // Puts the lesson's new badge (or null) on its row.
  const setModuleBadge = (moduleId, badge) =>
    setSelected((course) =>
      course
        ? {
            ...course,
            modules: (course.modules ?? []).map((entry) =>
              entry.id === moduleId ? { ...entry, badge } : entry
            )
          }
        : course
    );

  const saveBadge = async (values) => {
    setBadgeBusy(true);
    setBadgeError(null);
    try {
      const badge = await saveModuleBadge(badgeFor.id, values);
      setModuleBadge(badgeFor.id, badge);
      setNotice({ tone: "ok", text: `The badge “${badge.title}” was saved.` });
      setBadgeFor(null);
    } catch (error) {
      setBadgeError(errorMessage(error, "Couldn't save this badge. Try again."));
    } finally {
      setBadgeBusy(false);
    }
  };

  const removeBadge = async () => {
    setBadgeBusy(true);
    setBadgeError(null);
    try {
      await deleteModuleBadge(badgeFor.id);
      setModuleBadge(badgeFor.id, null);
      setNotice({ tone: "ok", text: `The badge for “${badgeFor.title}” was deleted.` });
      setBadgeFor(null);
    } catch (error) {
      setBadgeError(errorMessage(error, "Couldn't delete this badge. Try again."));
    } finally {
      setBadgeBusy(false);
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

  // Uploads the chosen PDFs one after another. `title` is only used for a single file;
  // with several, each module is named after its file.
  const addModules = async ({ files, title }) => {
    if (!files?.length) return false;

    setBusy(true);
    setNotice(null);
    const added = [];
    const failed = [];

    for (const file of files) {
      setProgress(0);

      if (file.size > MAX_MODULE_BYTES) {
        failed.push(`${file.name} (larger than 40 MB)`);
        continue;
      }
      try {
        added.push(
          await createCourseModule(selected.id, file, {
            title: files.length === 1 ? title : "",
            onProgress: setProgress
          })
        );
      } catch (error) {
        failed.push(`${file.name} (${errorMessage(error, "upload failed")})`);
      }
    }

    // Slot the new ones in by lesson number, the order the API lists modules in.
    if (added.length) setModules(sortedLessons([...(selected.modules ?? []), ...added]));

    const addedText =
      added.length === 1
        ? `“${added[0].title}” was added to this course.`
        : `${plural(added.length, "module")} were added to this course.`;
    setNotice(
      failed.length
        ? { tone: "error", text: `${added.length ? `${addedText} ` : ""}Not added: ${failed.join(", ")}.` }
        : { tone: "ok", text: addedText }
    );

    setBusy(false);
    setProgress(0);
    return failed.length === 0;
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
        removed.assessments ? `${removed.assessments} exam` : "",
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

  // Open the delete dialog, and count what it would remove.
  const askToDeleteCourse = (course) => {
    const token = courseImpactRequest.next();
    setDeleting(course);
    setCourseImpact(null);
    setDeleteError(null);
    fetchCourseImpact(course.id)
      .then((data) => {
        if (courseImpactRequest.isCurrent(token)) setCourseImpact(data);
      })
      .catch(() => {
        if (courseImpactRequest.isCurrent(token)) setCourseImpact({ unknown: true });
      });
  };

  const closeDelete = () => {
    setDeleting(null);
    setCourseImpact(null);
    setDeleteError(null);
  };

  const removeCourse = async () => {
    setBusy(true);
    setDeleteError(null);
    try {
      const removed = await deleteCourse(deleting.id);
      setCourses((list) => list.filter((c) => c.id !== deleting.id));
      closeDelete();
      setNotice({
        tone: "ok",
        text: `“${removed.title || deleting.title}” was deleted, along with ${plural(removed.modules ?? 0, "lesson")}.`
      });
    } catch (error) {
      // The dialog stays open with the reason in it.
      setDeleteError(errorMessage(error, "Couldn't delete this course."));
    } finally {
      setBusy(false);
    }
  };

  // Set a course to active, inactive or archived from the 3-dots menu.
  const changeStatus = async (course, nextStatus) => {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await setCourseStatus(course.id, nextStatus);
      setCourses((list) =>
        list.map((c) => (c.id === saved.id ? { ...c, status: saved.status } : c))
      );
      setNotice({ tone: "ok", text: `“${course.title}” is now ${saved.status}.` });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error, "Couldn't change this course's status.") });
    } finally {
      setBusy(false);
    }
  };

  const statusFields = useMemo(() => {
    const count = (value) => courses.filter((c) => (c.status ?? "active") === value).length;
    return [
      {
        id: "status",
        label: "Status",
        options: [
          { value: FILTER_ALL, label: "All courses", meta: `${courses.length - count("archived")}` },
          { value: "active", label: "Active", meta: `${count("active")}` },
          { value: "inactive", label: "Inactive", meta: `${count("inactive")}` },
          { value: "archived", label: "Archived", meta: `${count("archived")}` }
        ],
        match: (course, value) => (course.status ?? "active") === value
      }
    ];
  }, [courses]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return courses.filter(
      (course) =>
        // "All courses" leaves out archived ones.
        (statusFilter === "archived" || course.status !== "archived") &&
        passesFilter(statusFields, "status", statusFilter, course) &&
        `${course.title} ${course.code}`.toLowerCase().includes(term)
    );
  }, [courses, query, statusFields, statusFilter]);

  // 10 rows per page; back to page 1 when the search or filter changes.
  const { pageRows, page, pageCount, setPage } = usePagination(visible, `${query}|${statusFilter}`);

  if (selected) {
    const modules = selected.modules ?? [];

    return (
      <div className="admin-main__inner">
        <BackLink onClick={closeCourse}>Courses Management</BackLink>

        <CourseHeader
          course={selected}
          lessons={modules.length}
          ready={detailStatus === "ready"}
          actions={
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
              </div>
            ) : null
          }
        />

        {notice ? (
          <p className={noticeClass(notice, `admin-notice admin-notice--${notice.tone}`)} role="status">
            {notice.text}
          </p>
        ) : null}

        <ModuleList
          key={selected.id}
          modules={modules}
          detailStatus={detailStatus}
          busy={busy}
          confirming={confirming}
          impact={impact}
          onPreview={setPreview}
          onBadge={openBadge}
          onPreAssessment={openPreAssessment}
          onAskRemove={askToRemove}
          onRemove={removeModule}
          onCancelRemove={() => {
            setConfirming(null);
            setImpact(null);
          }}
          progress={progress}
          onAdd={addModules}
        />

        {preview ? <ModulePreview module={preview} onClose={() => setPreview(null)} /> : null}

        {badgeFor ? (
          <BadgeForm
            module={badgeFor}
            busy={badgeBusy}
            error={badgeError}
            onCancel={() => setBadgeFor(null)}
            onSave={saveBadge}
            onDelete={removeBadge}
          />
        ) : null}

        {courseForm ? (
          <CourseForm
            course={courseForm === "new" ? null : courseForm}
            busy={busy}
            error={formError}
            onCancel={() => setCourseForm(null)}
            categories={categories}
            onSave={saveCourse}
          >
            {/* Uses the live course, so a new picture shows straight away. */}
            <CourseImageForm
              course={selected}
              busy={imageBusy}
              progress={imageProgress}
              onUpload={setCourseImage}
              onRemove={clearCourseImage}
            />
          </CourseForm>
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
        <div className="admin-toolbar__filter">
          <ListFilter
            fields={statusFields}
            field="status"
            onFieldChange={() => {}}
            value={statusFilter}
            onValueChange={setStatusFilter}
            noun="courses"
          />
        </div>

        <div className="admin-toolbar__search">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search courses…"
            label="Search courses"
            hint={`${visible.length} of ${courses.length}`}
            notice={notice}
          />
        </div>

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
                  <th>Runs</th>
                  <th className="is-center">Modules</th>
                  <th className="is-center">Students</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((course) => (
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
                            <div className="admin-person__id">
                              {course.code}
                              {course.status === "inactive" || course.status === "archived" ? (
                                <span className={`admin-status-tag admin-status-tag--${course.status}`}>
                                  {course.status === "inactive" ? "Inactive" : "Archived"}
                                </span>
                              ) : null}
                            </div>
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
                        nothing uploaded yet. The zero stays a zero and takes
                        the warning colour, so it is still the figure the eye
                        stops on without being a word in a column of numbers. */}
                    <td className="is-center">
                      <span
                        className={`admin-count${course.moduleCount === 0 ? " admin-count--none" : ""}`}
                      >
                        {course.moduleCount}
                      </span>
                    </td>
                    <td className="is-center">
                      <strong className="admin-strong-brand">{course.studentCount}</strong>
                    </td>
                    <td className="admin-table__chevron">
                      <StatusMenu
                        name={course.title}
                        status={course.status}
                        busy={busy}
                        onChange={(next) => changeStatus(course, next)}
                        onDelete={() => askToDeleteCourse(course)}
                      />
                    </td>
                  </tr>
                ))}

                {visible.length === 0 ? (
                  <tr className="admin-table__empty">
                    <td colSpan={5}>No courses match your search or filter.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} label="Courses" />
        </>
      )}

      {/* "New course" is a list-screen action, so its form belongs here too. */}
      {courseForm === "new" ? (
        <CourseForm
          course={null}
          busy={busy}
          error={formError}
          onCancel={() => setCourseForm(null)}
          categories={categories}
          onSave={saveCourse}
        />
      ) : null}

      {deleting ? (
        <ConfirmDeleteModal
          title="Delete this course?"
          subject={[deleting.code, deleting.title].filter(Boolean).join(" · ")}
          losses={courseLosses(courseImpact)}
          keeps={courseKeeps(courseImpact)}
          busy={busy}
          confirmLabel="Delete course"
          confirmWord="CONFIRM"
          error={deleteError}
          onCancel={closeDelete}
          onConfirm={removeCourse}
        />
      ) : null}
    </div>
  );
}

export default CourseManagement;
