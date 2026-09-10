import { useEffect, useMemo, useState } from "react";

import { useNotice } from "../../lib/useNotice";
import {
  createClass,
  deleteClass,
  fetchClass,
  fetchClasses,
  fetchClassImpact,
  setClassActive,
  updateClass
} from "../../services/classes";
import { fetchAssessors, fetchCourses, fetchStudents } from "../../services/admin";
import { ChevronRightIcon, ClassesIcon } from "./components/icons";
import {
  AdminButton,
  AdminModal,
  chosenOption,
  ConfirmDeleteModal,
  FILTER_ALL,
  ListFilter,
  PageHeader,
  passesFilter,
  SearchField,
  useListFilter
} from "./components/ui";
import ClassForm from "./components/classes/ClassForm";
import { classKeeps, classLosses, scheduleSummary } from "./components/classes/classText";
import { errorMessage, plural } from "./lib/format";
import { SkeletonTable, SkeletonText } from "../../components/Skeleton";

// The option that means "the ones with none of it" - no course, no assessor.
// Its sense is the field's, so the same id serves both without colliding.
const NONE = "none";

function ClassesManagement() {
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [assessors, setAssessors] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const filter = useListFilter("course");

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useNotice();

  // The form is "new", a loaded class object being edited, or null. `deleting`
  // is the class awaiting a "yes, delete", with its impact filled in once read.
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [impact, setImpact] = useState(null);
  // A refused delete. It belongs in the confirmation, which stays open rather
  // than dropping the admin back on the list with a line they have to connect
  // to what they were doing.
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    let active = true;

    Promise.all([fetchClasses(), fetchCourses(), fetchStudents(), fetchAssessors()])
      .then(([classList, courseList, studentList, assessorData]) => {
        if (!active) return;
        setClasses(classList);
        setCourses(courseList);
        setStudents(studentList);
        setAssessors(assessorData.assessors ?? []);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const refreshClasses = async () => {
    setClasses(await fetchClasses());
  };

  const openNew = () => {
    setFormError(null);
    setForm("new");
  };

  const openEdit = (cls) => {
    setFormError(null);
    setForm({ id: cls.id, loading: true });
    fetchClass(cls.id)
      .then((full) => setForm({ ...full, loading: false }))
      .catch(() => {
        setForm(null);
        setNotice({ tone: "error", text: "Couldn't load this class for editing." });
      });
  };

  const saveClass = async (values) => {
    setBusy(true);
    setFormError(null);
    try {
      if (form === "new") {
        const created = await createClass(values);
        await refreshClasses();
        setNotice({ tone: "ok", text: `“${created.name}” was created.` });
      } else {
        const saved = await updateClass(form.id, values);
        await refreshClasses();
        setNotice({ tone: "ok", text: `“${saved.name}” was updated.` });
      }
      setForm(null);
    } catch (error) {
      // Kept in the form: a missing name or course is fixed in the field the
      // admin is still looking at.
      setFormError(errorMessage(error, "Couldn't save this class. Try again."));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Run this class, or stop running it.
   *
   * Written straight from the row rather than through the form: it is one
   * field, it is reversible, and asking someone to open a modal to flip a
   * switch is the kind of step that makes a screen tiring. The row moves first
   * and goes back if the write fails, so the switch answers the click.
   */
  const toggleActive = async (cls) => {
    const next = !cls.active;
    setClasses((list) => list.map((row) => (row.id === cls.id ? { ...row, active: next } : row)));
    setBusy(true);
    try {
      await setClassActive(cls.id, next);
      setNotice({
        tone: "ok",
        text: `“${cls.name}” is now ${next ? "active" : "inactive"}.`
      });
    } catch (error) {
      setClasses((list) =>
        list.map((row) => (row.id === cls.id ? { ...row, active: cls.active } : row))
      );
      setNotice({
        tone: "error",
        text: errorMessage(error, "Couldn't change this class's status.")
      });
    } finally {
      setBusy(false);
    }
  };

  const askToDelete = (cls) => {
    setDeleting(cls);
    setImpact(null);
    setDeleteError(null);
    fetchClassImpact(cls.id)
      .then(setImpact)
      .catch(() => setImpact({ unknown: true }));
  };

  const removeClass = async () => {
    setBusy(true);
    setDeleteError(null);
    try {
      const removed = await deleteClass(deleting.id);
      setClasses((list) => list.filter((cls) => cls.id !== deleting.id));
      setDeleting(null);
      setImpact(null);
      // The class it was editing has gone with it.
      setForm(null);
      const also = classKeeps(impact);
      setNotice({
        tone: "ok",
        text: `“${removed.name}” was deleted${
          also.length ? `. ${plural(impact.unenroll ?? 0, "student")} unenrolled, ${plural(impact.unassign ?? 0, "assessor")} unassigned.` : "."
        }`
      });
    } catch (error) {
      // Kept open, with the reason in it — closing the dialog to report a
      // failure throws away the confirmation the admin just typed.
      setDeleteError(errorMessage(error, "Couldn't delete this class."));
    } finally {
      setBusy(false);
    }
  };

  /**
   * The three things a class can be narrowed by, in the order an admin asks
   * about them: which course it teaches, whether it is running, and whose it
   * is to assess.
   *
   * Every course and every assessor is offered whether or not they hold a
   * class: that a course has none scheduled, or that an assessor has been
   * given nothing, is the answer to a question this screen is opened with, and
   * dropping the empty rows makes it unanswerable here.
   */
  const fields = useMemo(() => {
    const all = { value: FILTER_ALL, label: "All classes", meta: `${classes.length}` };

    const perCourse = new Map(courses.map((course) => [course.id, 0]));
    const perAssessor = new Map(assessors.map((assessor) => [assessor.id, 0]));
    let unlinked = 0;
    let unstaffed = 0;
    let running = 0;

    for (const cls of classes) {
      if (cls.active) running += 1;

      if (cls.course) perCourse.set(cls.course.id, (perCourse.get(cls.course.id) ?? 0) + 1);
      else unlinked += 1;

      const staff = cls.assessors ?? [];
      if (staff.length === 0) unstaffed += 1;
      staff.forEach((one) => perAssessor.set(one.id, (perAssessor.get(one.id) ?? 0) + 1));
    }

    return [
      {
        id: "course",
        label: "Course",
        options: [
          all,
          ...courses.map((course) => ({
            value: course.id,
            label: course.title || course.code,
            meta: `${course.code} · ${perCourse.get(course.id) ?? 0}`,
            empty: "No class on this course yet."
          })),
          {
            value: NONE,
            label: "Not tied to any course",
            meta: `${unlinked}`,
            empty: "Every class is tied to a course."
          }
        ],
        match: (cls, value) => (value === NONE ? !cls.course : cls.course?.id === value)
      },
      {
        id: "status",
        label: "Status",
        options: [
          all,
          { value: "active", label: "Active", meta: `${running}`, empty: "No class is running." },
          {
            value: "inactive",
            label: "Inactive",
            meta: `${classes.length - running}`,
            empty: "Every class is running."
          }
        ],
        match: (cls, value) => (value === "active" ? Boolean(cls.active) : !cls.active)
      },
      {
        id: "assessor",
        label: "Assessor",
        options: [
          all,
          ...assessors.map((assessor) => ({
            value: assessor.id,
            label: assessor.name,
            meta: `${perAssessor.get(assessor.id) ?? 0}`,
            empty: "No class is theirs to assess yet."
          })),
          {
            value: NONE,
            label: "No assessor",
            meta: `${unstaffed}`,
            empty: "Every class has an assessor."
          }
        ],
        match: (cls, value) =>
          value === NONE
            ? (cls.assessors ?? []).length === 0
            : (cls.assessors ?? []).some((one) => one.id === value)
      }
    ];
  }, [classes, courses, assessors]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();

    return classes.filter((cls) => {
      // The filter narrows first, so the search only ever runs over the rows
      // already on screen.
      if (!passesFilter(fields, filter.field, filter.value, cls)) return false;
      if (!term) return true;

      const haystack = [
        cls.name,
        cls.course?.code,
        cls.course?.title,
        ...(cls.assessors ?? []).map((a) => a.name)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [classes, query, fields, filter.field, filter.value]);

  return (
    <div className="admin-main__inner">
      <PageHeader title="Classes Management" icon={ClassesIcon} />

      {/* Filter first, then type. Dropdowns rather than a row of chips: they
          hold any number of courses and assessors without growing sideways. */}
      <div className="admin-toolbar">
        <div className="admin-toolbar__filter admin-toolbar__filter--wide">
          <ListFilter fields={fields} noun="classes" {...filter} />
        </div>

        <div className="admin-toolbar__search">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search classes…"
            label="Search classes"
            hint={`${visible.length} of ${classes.length}`}
            notice={notice}
          />
        </div>

        <AdminButton
          variant="admin-toolbar__action"
          onClick={openNew}
          disabled={status !== "ready"}
        >
          New class
        </AdminButton>
      </div>

      {status === "loading" ? (
        <SkeletonTable rows={6} cols={7} label="Loading classes…" />
      ) : status === "error" ? (
        <div className="admin-state-card admin-state-card--error">
          Couldn&apos;t reach the API. Check that the server is running.
        </div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Course</th>
                <th>Assessors</th>
                <th className="is-center">Students</th>
                <th>Schedule</th>
                <th className="is-center">Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((cls) => {
                const schedule = scheduleSummary(cls.schedule);
                const assessorNames = (cls.assessors ?? []).map((a) => a.name);

                return (
                  <tr key={cls.id} className={cls.active ? "" : "is-inactive"}>
                    <td>
                      <button
                        type="button"
                        className="admin-person__name admin-person__link"
                        onClick={() => openEdit(cls)}
                      >
                        {cls.name}
                      </button>
                    </td>
                    <td>
                      {cls.course ? (
                        <>
                          <span className="admin-cell__quiet">{cls.course.title}</span>
                          <span className="admin-cell__sub">{cls.course.code}</span>
                        </>
                      ) : (
                        <span className="admin-count admin-count--none">No course</span>
                      )}
                    </td>
                    <td>
                      {assessorNames.length > 0 ? (
                        <span className="admin-cell__quiet">{assessorNames.join(", ")}</span>
                      ) : (
                        <span className="admin-count admin-count--none">0</span>
                      )}
                    </td>
                    <td className="is-center">
                      <span
                        className={`admin-count${cls.studentCount > 0 ? "" : " admin-count--none"}`}
                      >
                        {cls.studentCount}
                      </span>
                    </td>
                    <td>
                      {schedule ? (
                        <span className="admin-cell__quiet">{schedule}</span>
                      ) : (
                        <span className="admin-cell__quiet">—</span>
                      )}
                    </td>
                    <td className="is-center">
                      <button
                        type="button"
                        className={`admin-switch${cls.active ? " is-on" : ""}`}
                        role="switch"
                        aria-checked={Boolean(cls.active)}
                        disabled={busy}
                        onClick={() => toggleActive(cls)}
                        title={
                          cls.active
                            ? `Stop running ${cls.name}`
                            : `Start running ${cls.name}`
                        }
                      >
                        <span className="admin-switch__track">
                          <span className="admin-switch__thumb" />
                        </span>
                        <span className="admin-switch__label">
                          {cls.active ? "Active" : "Inactive"}
                        </span>
                      </button>
                    </td>
                    <td className="admin-table__actions">
                      {/* The cue the student and assessor lists end their rows
                          on. Deleting used to sit beside it and is now in the
                          form's Danger Zone, so the row carries one action and
                          it is the harmless one.

                          A real button and not their decorative chevron: those
                          rows are one target with the name as the keyboard
                          entry, and this cell is a cell of its own. */}
                      <button
                        type="button"
                        className="admin-table__manage"
                        disabled={busy}
                        onClick={() => openEdit(cls)}
                      >
                        Manage
                        <ChevronRightIcon size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr className="admin-table__empty">
                  {/* A filtered-to-nothing table says something different from
                      a search that missed, and both say something different
                      from a console nobody has made a class in yet. */}
                  <td colSpan={7}>
                    {query.trim()
                      ? "No classes match your search."
                      : filter.value !== FILTER_ALL
                        ? chosenOption(fields, filter.field, filter.value)?.empty ??
                          "No class matches this filter."
                        : "No classes yet. Create one to enrol students and assign assessors together."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {form === "new" ? (
        <ClassForm
          klass={null}
          courses={courses}
          assessors={assessors}
          students={students}
          busy={busy}
          error={formError}
          onCancel={() => setForm(null)}
          onSave={saveClass}
        />
      ) : null}

      {form && form !== "new" && form.loading ? (
        <AdminModal title="Edit class" onClose={() => setForm(null)}>
          <SkeletonText lines={5} label="Loading class…" />
        </AdminModal>
      ) : null}

      {form && form !== "new" && !form.loading ? (
        <ClassForm
          klass={form}
          courses={courses}
          assessors={assessors}
          students={students}
          busy={busy}
          error={formError}
          confirming={Boolean(deleting)}
          onCancel={() => setForm(null)}
          onDelete={askToDelete}
          onSave={saveClass}
        />
      ) : null}

      {deleting ? (
        <ConfirmDeleteModal
          title="Delete this class?"
          subject={deleting.name}
          losses={classLosses(impact)}
          keeps={classKeeps(impact)}
          busy={busy}
          confirmLabel="Delete class"
          confirmWord="CONFIRM"
          error={deleteError}
          onCancel={() => {
            setDeleting(null);
            setImpact(null);
            setDeleteError(null);
          }}
          onConfirm={removeClass}
        />
      ) : null}
    </div>
  );
}

export default ClassesManagement;
