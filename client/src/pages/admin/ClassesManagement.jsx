import { useEffect, useMemo, useState } from "react";
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
import { CheckIcon, TrashIcon } from "./components/icons";
import { AdminButton, AdminModal, ConfirmDeleteModal, PageHeader, SearchField } from "./components/ui";
import ClassForm from "./components/classes/ClassForm";
import { classKeeps, classLosses, scheduleSummary } from "./components/classes/classText";
import { errorMessage, plural } from "./lib/format";
import { SkeletonTable, SkeletonText } from "../../components/Skeleton";

function ClassesManagement() {
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [assessors, setAssessors] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  // The form is "new", a loaded class object being edited, or null. `deleting`
  // is the class awaiting a "yes, delete", with its impact filled in once read.
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [impact, setImpact] = useState(null);

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
    fetchClassImpact(cls.id)
      .then(setImpact)
      .catch(() => setImpact({ unknown: true }));
  };

  const removeClass = async () => {
    setBusy(true);
    try {
      const removed = await deleteClass(deleting.id);
      setClasses((list) => list.filter((cls) => cls.id !== deleting.id));
      setDeleting(null);
      setImpact(null);
      const also = classKeeps(impact);
      setNotice({
        tone: "ok",
        text: `“${removed.name}” was deleted${
          also.length ? `. ${plural(impact.unenroll ?? 0, "student")} unenrolled, ${plural(impact.unassign ?? 0, "assessor")} unassigned.` : "."
        }`
      });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error, "Couldn't delete this class.") });
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return classes;
    return classes.filter((cls) => {
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
  }, [classes, query]);

  return (
    <div className="admin-main__inner">
      <PageHeader title="Classes Management" />

      <div className="admin-toolbar">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search classes…"
          label="Search classes"
          hint={`${visible.length} of ${classes.length}`}
        />

        <AdminButton
          variant="admin-toolbar__action"
          onClick={openNew}
          disabled={status !== "ready"}
        >
          New class
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
                        <span className="admin-count admin-count--none">None</span>
                      )}
                    </td>
                    <td className="is-center">
                      {cls.studentCount > 0 ? (
                        <span className="admin-count">{cls.studentCount}</span>
                      ) : (
                        <span className="admin-count admin-count--none">None</span>
                      )}
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
                      <button
                        type="button"
                        className="admin-chip-btn admin-chip-btn--quiet"
                        disabled={busy}
                        onClick={() => openEdit(cls)}
                      >
                        Manage
                      </button>
                      <button
                        type="button"
                        className="admin-chip-btn admin-chip-btn--icon admin-chip-btn--danger"
                        disabled={busy}
                        onClick={() => askToDelete(cls)}
                        aria-label={`Delete ${cls.name}`}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr className="admin-table__empty">
                  <td colSpan={7}>
                    {query.trim()
                      ? "No classes match your search."
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
          onCancel={() => setForm(null)}
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
          onCancel={() => {
            setDeleting(null);
            setImpact(null);
          }}
          onConfirm={removeClass}
        />
      ) : null}
    </div>
  );
}

export default ClassesManagement;
