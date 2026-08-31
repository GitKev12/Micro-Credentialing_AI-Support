import { useEffect, useMemo, useState } from "react";
import {
  fetchCourses,
  fetchStudent,
  fetchStudents,
  setStudentSuspended,
  updateStudent
} from "../../services/admin";
import { CheckIcon, ChevronRightIcon } from "./components/icons";
import { AdminSelect, Avatar, PageHeader, SearchField } from "./components/ui";
import { SkeletonTable } from "../../components/Skeleton";
import StudentDetail from "./components/students/StudentDetail";
import { formatDate } from "./lib/format";

// The two categories that are not a course: everyone, and everyone with no
// course at all. The server knows the same two names.
const CATEGORY_ALL = "all";
const CATEGORY_NONE = "none";

const EMPTY_ACTIVITY = {
  lessonsDone: 0,
  lessonsTotal: 0,
  badgesEarned: 0,
  badgesTotal: 0,
  pending: 0,
  lastActive: { at: null, kind: null }
};

function StudentsManagement() {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(CATEGORY_ALL);

  const [selected, setSelected] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  // The result of the last write, which is now only an edit to the student's
  // own details. A write that failed used to leave no trace on screen at all.
  const [notice, setNotice] = useState(null);

  // The student whose details are being corrected, if any.
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    let active = true;

    Promise.all([fetchStudents(), fetchCourses()])
      .then(([studentList, courseList]) => {
        if (!active) return;
        setStudents(studentList);
        setCourses(courseList);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const openStudent = (studentId) => {
    setDetailStatus("loading");
    setSelected({ id: studentId });
    setNotice(null);
    fetchStudent(studentId)
      .then((student) => {
        setSelected(student);
        setDetailStatus("ready");
      })
      .catch(() => setDetailStatus("error"));
  };

  const saveStudent = async (values) => {
    setBusy(true);
    setFormError(null);
    try {
      const saved = await updateStudent(form.id, values);
      setStudents((list) => list.map((s) => (s.id === saved.id ? { ...s, ...saved } : s)));
      setSelected((student) => (student ? { ...student, ...saved } : student));
      setNotice({ tone: "ok", text: `${saved.name}'s details were updated.` });
      setForm(null);
    } catch (error) {
      // Kept in the form: a taken email or a short password is fixed in the
      // field the admin is still looking at.
      setFormError(error?.response?.data?.message || "Couldn't save this student. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Suspend this student, or let them back in.
   *
   * Written straight from the row: one field, reversible, and nothing is
   * destroyed — a suspended student keeps their account, their enrolment and
   * everything they have earned, and simply cannot sign in until this is
   * turned off. The row moves first and goes back if the write fails.
   */
  const toggleSuspended = async (student) => {
    const next = !student.suspended;
    const patch = (list) =>
      list.map((row) => (row.id === student.id ? { ...row, suspended: next } : row));

    setStudents(patch);
    setBusy(true);
    try {
      await setStudentSuspended(student.id, next);
      setSelected((current) =>
        current && current.id === student.id ? { ...current, suspended: next } : current
      );
      setNotice({
        tone: "ok",
        text: `${student.name} is now ${next ? "suspended" : "active"}.`
      });
    } catch (error) {
      setStudents((list) =>
        list.map((row) =>
          row.id === student.id ? { ...row, suspended: student.suspended } : row
        )
      );
      setNotice({
        tone: "error",
        text: error?.response?.data?.message || "Couldn't change this student's status."
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * The options behind the category dropdown, with how many students each
   * holds. One control whatever the catalog does — six courses and sixty read
   * the same way, which a row of chips cannot claim.
   */
  const categories = useMemo(() => {
    const perCourse = new Map(courses.map((course) => [course.id, 0]));
    let unenrolled = 0;

    for (const student of students) {
      const enrolled = student.enrolled ?? [];
      if (enrolled.length === 0) {
        unenrolled += 1;
        continue;
      }
      for (const course of enrolled) {
        perCourse.set(course.id, (perCourse.get(course.id) ?? 0) + 1);
      }
    }

    return [
      { id: CATEGORY_ALL, label: "All students", meta: `${students.length}` },
      ...courses.map((course) => ({
        id: course.id,
        label: course.title || course.code,
        meta: `${course.code} · ${perCourse.get(course.id) ?? 0}`
      })),
      { id: CATEGORY_NONE, label: "Not enrolled in any course", meta: `${unenrolled}` }
    ];
  }, [students, courses]);

  const unenrolled = useMemo(
    () => students.filter((student) => (student.enrolled ?? []).length === 0).length,
    [students]
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();

    return students.filter((student) => {
      const enrolled = student.enrolled ?? [];

      // The category narrows first, so the search only ever runs over the
      // rows already on screen.
      const inCategory =
        category === CATEGORY_ALL
          ? true
          : category === CATEGORY_NONE
            ? enrolled.length === 0
            : enrolled.some((course) => course.id === category);
      if (!inCategory) return false;
      if (!term) return true;

      return `${student.name} ${student.studentNumber ?? ""} ${student.email ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [students, query, category]);

  if (selected) {
    return (
      <StudentDetail
        student={selected}
        detailStatus={detailStatus}
        busy={busy}
        notice={notice}
        form={form}
        formError={formError}
        onBack={() => setSelected(null)}
        onEdit={() => {
          setFormError(null);
          setForm(selected);
        }}
        onCancelForm={() => setForm(null)}
        onSave={saveStudent}
      />
    );
  }

  return (
    <div className="admin-main__inner">
      <PageHeader
        title="Students Management"
      />

      {/* Category first, then type. One dropdown holds any number of courses
          without growing sideways, which a row of chips does not. */}
      <div className="admin-toolbar">
        <div className="admin-toolbar__filter">
          <AdminSelect
            value={category}
            onChange={setCategory}
            label="Filter students by category"
            options={categories.map((entry) => ({
              value: entry.id,
              label: entry.label,
              meta: entry.meta
            }))}
          />
        </div>

        <div className="admin-toolbar__search">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search students…"
            label="Search students"
            hint={`${visible.length} of ${students.length}`}
          />
        </div>

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
        <SkeletonTable rows={6} cols={7} label="Loading students…" />
      ) : status === "error" ? (
        <div className="admin-state-card admin-state-card--error">
          Couldn&apos;t reach the API. Check that the server is running.
        </div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Student</th>
                <th className="is-center">Courses</th>
                <th className="is-center">Lessons</th>
                <th className="is-center">Badges</th>
                <th>Last active</th>
                <th className="is-center">Status</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => {
                const courseCount = student.enrolled?.length ?? 0;
                const activity = student.activity ?? EMPTY_ACTIVITY;
                const seen = formatDate(activity.lastActive?.at);

                return (
                  <tr
                    key={student.id}
                    className={student.suspended ? "is-inactive" : ""}
                    onClick={() => openStudent(student.id)}
                  >
                    <td>
                      <div className="admin-person">
                        <Avatar name={student.name} />
                        <div>
                          {/* The name is the control. The row click stays as a
                              mouse convenience, but it is a <tr> — nothing
                              focuses it, so the only keyboard path used to be
                              the 28px chevron at the far end of the row. */}
                          <button
                            type="button"
                            className="admin-person__name admin-person__link"
                            onClick={(event) => {
                              event.stopPropagation();
                              openStudent(student.id);
                            }}
                          >
                            {student.name}
                          </button>
                          <div className="admin-person__id">
                            {student.studentNumber ?? student.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* A bare "0" disappears in a column of counts, and an
                        unenrolled student is the row worth acting on, so it is
                        marked with weight and colour rather than left to be
                        read off as a digit. */}
                    <td className="is-center">
                      {courseCount > 0 ? (
                        <span className="admin-count">{courseCount}</span>
                      ) : (
                        <span className="admin-count admin-count--none">None</span>
                      )}
                    </td>
                    {/* Lessons and badges both read "x of y": the numerator on
                        its own cannot say whether nought is a student who has
                        not started or a course with nothing in it yet. */}
                    <td className="is-center">
                      {activity.lessonsTotal > 0 ? (
                        <span className="admin-count">
                          {activity.lessonsDone} of {activity.lessonsTotal}
                        </span>
                      ) : (
                        <span className="admin-cell__quiet">—</span>
                      )}
                    </td>
                    <td className="is-center">
                      {activity.badgesTotal > 0 ? (
                        <span className="admin-count">
                          {activity.badgesEarned} of {activity.badgesTotal}
                        </span>
                      ) : (
                        <span className="admin-cell__quiet">—</span>
                      )}
                    </td>
                    {/* Enrolment says a student was signed up. This says
                        whether they ever turned up, which is the row worth
                        acting on and the one the list could not show. */}
                    <td>
                      {seen ? (
                        <>
                          <span className="admin-cell__quiet">{seen}</span>
                          <span className="admin-cell__sub">
                            {activity.lastActive.kind === "quiz" ? "quiz" : "lesson"}
                          </span>
                        </>
                      ) : (
                        <span className="admin-count admin-count--none">Never</span>
                      )}
                    </td>
                    <td className="is-center">
                      <button
                        type="button"
                        className={`admin-switch${student.suspended ? "" : " is-on"}`}
                        role="switch"
                        aria-checked={!student.suspended}
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSuspended(student);
                        }}
                        title={
                          student.suspended
                            ? `Activate ${student.name}`
                            : `Suspend ${student.name}`
                        }
                      >
                        <span className="admin-switch__track">
                          <span className="admin-switch__thumb" />
                        </span>
                        <span className="admin-switch__label">
                          {student.suspended ? "Suspended" : "Active"}
                        </span>
                      </button>
                    </td>
                    <td className="admin-table__chevron" aria-hidden="true">
                      <span className="admin-table__cue">
                        <ChevronRightIcon />
                      </span>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr className="admin-table__empty">
                  {/* A filtered-to-nothing table says something different from
                      a search that missed, and an admin needs to know which
                      of the two they are looking at. */}
                  <td colSpan={7}>
                    {query.trim()
                      ? "No students match your search."
                      : category === CATEGORY_NONE
                        ? "Every student is enrolled in a course."
                        : "No students in this category yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

export default StudentsManagement;
