import { useEffect, useMemo, useState } from "react";
import {
  createStudent,
  deleteStudent,
  fetchCourses,
  fetchStudent,
  fetchStudentImpact,
  fetchStudents,
  setStudentSuspended,
  updateStudent
} from "../../services/admin";
import { ChevronRightIcon, StudentsIcon } from "./components/icons";
import {
  AdminButton,
  chosenOption,
  Avatar,
  ConfirmDeleteModal,
  FILTER_ALL,
  ListFilter,
  PageHeader,
  passesFilter,
  SearchField,
  useListFilter
} from "./components/ui";
import { SkeletonTable } from "../../components/Skeleton";
import StudentDetail from "./components/students/StudentDetail";
import StudentForm from "./components/students/StudentForm";
import { studentKeeps, studentLosses } from "./components/students/studentText";
import { formatDate } from "./lib/format";
import { useLatestRequest } from "../../lib/useLatestRequest";
import { useNotice } from "../../lib/useNotice";

// The course option that is not a course: everyone holding none at all.
const NONE = "none";

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
  const filter = useListFilter("course");

  const [selected, setSelected] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  // The result of the last write, which is now only an edit to the student's
  // own details. A write that failed used to leave no trace on screen at all.
  const [notice, setNotice] = useNotice();

  // The student whose details are being corrected, if any.
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  // The student awaiting a "yes, delete", with the cost filled in once read.
  const [deleting, setDeleting] = useState(null);
  const [impact, setImpact] = useState(null);

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

  const detailRequest = useLatestRequest();
  const impactRequest = useLatestRequest();

  const openStudent = (studentId) => {
    // Claimed before the fetch, so a slower reply for a record the
    // admin has already clicked past is dropped rather than shown.
    const token = detailRequest.next();
    setDetailStatus("loading");
    setSelected({ id: studentId });
    setNotice(null);
    fetchStudent(studentId)
      .then((student) => {
        if (!detailRequest.isCurrent(token)) return;
        setSelected(student);
        setDetailStatus("ready");
      })
      .catch(() => {
        if (detailRequest.isCurrent(token)) setDetailStatus("error");
      });
  };

  const saveStudent = async (values) => {
    setBusy(true);
    setFormError(null);
    try {
      if (form === "new") {
        const created = await createStudent(values);
        // Re-read rather than append: the list is sorted by surname on the
        // server, so an appended row sits at the bottom until the next load
        // and then jumps. Refetching also gives the new row the same shape the
        // others have — a created account comes back in the detail shape,
        // which carries no activity figures.
        setStudents(await fetchStudents());
        setNotice({ tone: "ok", text: `${created.name} was added.` });
      } else {
        const saved = await updateStudent(form.id, values);
        setStudents((list) => list.map((s) => (s.id === saved.id ? { ...s, ...saved } : s)));
        setSelected((student) => (student ? { ...student, ...saved } : student));
        setNotice({ tone: "ok", text: `${saved.name}'s details were updated.` });
      }
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
   * Ask first, and say what it would cost.
   *
   * The counts are read rather than assumed: a student who has never opened a
   * lesson and one who has finished the course both look the same from a row,
   * and only one of those deletions throws work away.
   */
  const askToDelete = (student) => {
    // The costs are read for one record; a reply that arrives after the
    // admin has cancelled and opened another must not fill in that one.
    const token = impactRequest.next();
    setDeleting(student);
    setImpact(null);
    fetchStudentImpact(student.id)
      .then((data) => {
        if (impactRequest.isCurrent(token)) setImpact(data);
      })
      .catch(() => {
        if (impactRequest.isCurrent(token)) setImpact({ unknown: true });
      });
  };

  const removeStudent = async () => {
    setBusy(true);
    try {
      const { student } = await deleteStudent(deleting.id);
      setStudents((list) => list.filter((row) => row.id !== deleting.id));
      setDeleting(null);
      setImpact(null);
      // The detail screen is looking at a record that no longer exists.
      if (selected?.id === deleting.id) setSelected(null);
      setNotice({ tone: "ok", text: `${student.name} was deleted.` });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.response?.data?.message || "Couldn't delete this student."
      });
      setDeleting(null);
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
  /**
   * The two things a students list is narrowed by: the course they hold, and
   * whether the account is still open. Course first, being the one an admin
   * comes to this screen with; status answers a different question about the
   * same person and used to need a read of every row to answer.
   *
   * Every course is offered whether or not anyone holds it — that nobody does
   * is the answer to a question this screen is opened with.
   */
  const fields = useMemo(() => {
    const all = { value: FILTER_ALL, label: "All students", meta: `${students.length}` };

    const perCourse = new Map(courses.map((course) => [course.id, 0]));
    let withoutCourse = 0;
    let suspended = 0;

    for (const student of students) {
      if (student.suspended) suspended += 1;

      const enrolled = student.enrolled ?? [];
      if (enrolled.length === 0) withoutCourse += 1;
      enrolled.forEach((course) =>
        perCourse.set(course.id, (perCourse.get(course.id) ?? 0) + 1)
      );
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
            empty: "No student on this course yet."
          })),
          {
            value: NONE,
            label: "Not enrolled in any course",
            meta: `${withoutCourse}`,
            empty: "Every student is enrolled in a course."
          }
        ],
        match: (student, value) => {
          const enrolled = student.enrolled ?? [];
          return value === NONE
            ? enrolled.length === 0
            : enrolled.some((course) => course.id === value);
        }
      },
      {
        id: "status",
        label: "Status",
        options: [
          all,
          {
            value: "active",
            label: "Active",
            meta: `${students.length - suspended}`,
            empty: "Every student is suspended."
          },
          {
            value: "suspended",
            label: "Suspended",
            meta: `${suspended}`,
            empty: "No student is suspended."
          }
        ],
        match: (student, value) =>
          value === "active" ? !student.suspended : Boolean(student.suspended)
      }
    ];
  }, [students, courses]);

  const unenrolled = useMemo(
    () => students.filter((student) => (student.enrolled ?? []).length === 0).length,
    [students]
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();

    return students.filter((student) => {
      // The filter narrows first, so the search only ever runs over the rows
      // already on screen.
      if (!passesFilter(fields, filter.field, filter.value, student)) return false;
      if (!term) return true;

      return `${student.name} ${student.studentNumber ?? ""} ${student.email ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [students, query, fields, filter.field, filter.value]);

  /**
   * Rendered by both branches below.
   *
   * The detail screen returns before the list's JSX is reached, so a confirm
   * that lived only down there opened for a row and did nothing at all for the
   * Delete button on the detail — which is the one place the account is fully
   * in view when you decide.
   */
  const deleteConfirm = deleting ? (
    <ConfirmDeleteModal
      title="Delete this student?"
      subject={`${deleting.name}${deleting.studentNumber ? ` · ${deleting.studentNumber}` : ""}`}
      losses={studentLosses(impact)}
      keeps={studentKeeps(impact)}
      busy={busy}
      confirmLabel="Delete student"
      onCancel={() => {
        setDeleting(null);
        setImpact(null);
      }}
      onConfirm={removeStudent}
    />
  ) : null;

  if (selected) {
    return (
      <>
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
        onToggleSuspended={() => toggleSuspended(selected)}
        onDelete={() => askToDelete(selected)}
        onCancelForm={() => setForm(null)}
        onSave={saveStudent}
      />
        {deleteConfirm}
      </>
    );
  }

  return (
    <div className="admin-main__inner">
      <PageHeader
        title="Students Management"
        icon={StudentsIcon}
      />

      {/* Filter first, then type. Dropdowns rather than a row of chips: they
          hold any number of courses without growing sideways. */}
      <div className="admin-toolbar">
        <div className="admin-toolbar__filter admin-toolbar__filter--wide">
          <ListFilter fields={fields} noun="students" {...filter} />
        </div>

        <div className="admin-toolbar__search">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search students…"
            label="Search students"
            hint={`${visible.length} of ${students.length}`}
            notice={notice}
          />
        </div>

        <AdminButton
          variant="admin-toolbar__action"
          onClick={() => {
            setFormError(null);
            setForm("new");
          }}
          disabled={status !== "ready"}
        >
          New student
        </AdminButton>
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
                    {/* An unenrolled student is the row worth acting on, so
                        the zero takes the warning colour rather than sitting in
                        the column as an unremarkable digit. It stays a figure:
                        the column is counts, and a word in it does not line up
                        with the numbers above and below it. */}
                    <td className="is-center">
                      <span className={`admin-count${courseCount > 0 ? "" : " admin-count--none"}`}>
                        {courseCount}
                      </span>
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
                    {/* Reported here, set on the student's own screen. A
                        switch in a row is a control you can hit while aiming
                        at the row itself, and suspending someone is not a
                        thing to do by near-miss — it is done where the person
                        is named and their record is in front of you. */}
                    <td className="is-center">
                      <span
                        className={`admin-status-pill${
                          student.suspended ? " admin-status-pill--off" : ""
                        }`}
                      >
                        {student.suspended ? "Suspended" : "Active"}
                      </span>
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
                      : chosenOption(fields, filter.field, filter.value)?.empty ??
                        "No students match this filter."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <StudentForm
          student={form === "new" ? null : form}
          busy={busy}
          error={formError}
          onCancel={() => setForm(null)}
          onSave={saveStudent}
        />
      ) : null}

      {deleteConfirm}
    </div>
  );
}

export default StudentsManagement;
