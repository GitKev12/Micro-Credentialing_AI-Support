import { useEffect, useMemo, useState } from "react";
import {
  createStudent,
  deleteStudent,
  fetchCourses,
  fetchStudent,
  fetchStudentImpact,
  fetchStudents,
  setStudentStatus,
  setStudentSuspended,
  updateStudent
} from "../../services/admin";
import { StudentsIcon } from "./components/icons";
import {
  AdminButton,
  chosenOption,
  Avatar,
  FILTER_ALL,
  ListFilter,
  PageHeader,
  passesFilter,
  SearchField,
  StatusMenu,
  AccountStatusPill,
  accountStatusOf,
  useListFilter,
  Pagination,
  usePagination,
  NewPasswordModal,
  ConfirmDeleteModal
} from "./components/ui";
import { SkeletonTable } from "../../components/Skeleton";
import StudentDetail from "./components/students/StudentDetail";
import StudentForm from "./components/students/StudentForm";
import { saveStudents } from "./components/students/importStudents";
import { formatDate, plural } from "./lib/format";
import { useLatestRequest } from "../../lib/useLatestRequest";
import { studentKeeps, studentLosses } from "./lib/deleteText";
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

const statusOf = accountStatusOf;

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
  // The new ID number and password, shown once after saving.
  const [newLogin, setNewLogin] = useState(null);
  // The archived student being deleted, what it would remove, and any refusal.
  const [deleting, setDeleting] = useState(null);
  const [impact, setImpact] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const impactRequest = useLatestRequest();

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
        const { student: created, password } = await createStudent(values);
        // Re-read rather than append: the list is sorted by surname on the
        // server, so an appended row sits at the bottom until the next load
        // and then jumps. Refetching also gives the new row the same shape the
        // others have — a created account comes back in the detail shape,
        // which carries no activity figures.
        setStudents(await fetchStudents());
        setNotice({ tone: "ok", text: `${created.name} was added.` });
        setNewLogin({ title: "Student created", name: created.name, idNumber: created.studentNumber, password });
      } else {
        const { student: saved, password } = await updateStudent(form.id, values);
        if (password) {
          setNewLogin({ title: "New password", name: saved.name, idNumber: saved.studentNumber, password });
        }
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

  // Saves every student from the spreadsheet, reloads the list,
  // and returns the rows that failed so the form can list them.
  const importStudents = async (list) => {
    setBusy(true);
    setFormError(null);
    const failed = await saveStudents(list);
    const added = plural(list.length - failed.length, "student");

    try {
      setStudents(await fetchStudents());
    } catch {
      setNotice({ tone: "error", text: "Couldn't reload the list. Refresh the page." });
    }

    if (failed.length === 0) {
      setNotice({ tone: "ok", text: `${added} added.` });
      setForm(null);
    } else {
      // Keep the form open so the admin can see which rows to fix.
      setFormError(`${added} added. Fix the rows below in your file, then import them again.`);
    }
    setBusy(false);
    return failed;
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
        text: `${student.name} is now ${next ? "inactive" : "active"}.`
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
  // Open the delete dialog, and count what it would remove.
  const askToDelete = (student) => {
    const token = impactRequest.next();
    setDeleting(student);
    setImpact(null);
    setDeleteError(null);
    fetchStudentImpact(student.id)
      .then((data) => {
        if (impactRequest.isCurrent(token)) setImpact(data);
      })
      .catch(() => {
        if (impactRequest.isCurrent(token)) setImpact({ unknown: true });
      });
  };

  const closeDelete = () => {
    setDeleting(null);
    setImpact(null);
    setDeleteError(null);
  };

  const removeStudent = async () => {
    setBusy(true);
    setDeleteError(null);
    try {
      const { student } = await deleteStudent(deleting.id);
      setStudents((list) => list.filter((row) => row.id !== deleting.id));
      closeDelete();
      setNotice({ tone: "ok", text: `${student.name} was deleted.` });
    } catch (error) {
      // The dialog stays open with the reason in it.
      setDeleteError(error?.response?.data?.message || "Couldn't delete this student.");
    } finally {
      setBusy(false);
    }
  };

  // Set a student to active, inactive or archived from the 3-dots menu.
  const changeStatus = async (student, status) => {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await setStudentStatus(student.id, status);
      const flags = { suspended: saved.suspended, archived: saved.archived };
      setStudents((list) => list.map((row) => (row.id === student.id ? { ...row, ...flags } : row)));
      setNotice({ tone: "ok", text: `${student.name} is now ${status}.` });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.response?.data?.message || "Couldn't change this student's status."
      });
    } finally {
      setBusy(false);
    }
  };

  const fields = useMemo(() => {
    // Archived students only count under "Archived".
    const current = students.filter((row) => !row.archived);
    const all = { value: FILTER_ALL, label: "All students", meta: `${current.length}` };

    const perCourse = new Map(courses.map((course) => [course.id, 0]));
    let withoutCourse = 0;
    let inactive = 0;

    for (const student of current) {
      if (student.suspended) inactive += 1;

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
            meta: `${current.length - inactive}`,
            empty: "Every student is inactive."
          },
          {
            value: "inactive",
            label: "Inactive",
            meta: `${inactive}`,
            empty: "No student is inactive."
          },
          {
            value: "archived",
            label: "Archived",
            meta: `${students.length - current.length}`,
            empty: "No student is archived."
          }
        ],
        match: (student, value) => statusOf(student) === value
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
      // Archived students only show when the Archived filter is picked.
      if (student.archived && !(filter.field === "status" && filter.value === "archived")) {
        return false;
      }
      if (!passesFilter(fields, filter.field, filter.value, student)) return false;
      if (!term) return true;

      return `${student.name} ${student.studentNumber ?? ""} ${student.email ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [students, query, fields, filter.field, filter.value]);

  // 10 rows per page; back to page 1 when the search or filter changes.
  const { pageRows, page, pageCount, setPage } = usePagination(visible, `${query}|${filter.field}|${filter.value}`);

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
        onCancelForm={() => setForm(null)}
        onSave={saveStudent}
      />
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
                <th className="admin-col-id">Student #</th>
                <th>Student</th>
                <th className="is-center">Courses</th>
                <th className="is-center">Lessons</th>
                <th className="is-center">Badges</th>
                <th>Last active</th>
                <th className="is-center">Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((student) => {
                const courseCount = student.enrolled?.length ?? 0;
                const activity = student.activity ?? EMPTY_ACTIVITY;
                const seen = formatDate(activity.lastActive?.at);

                return (
                  <tr
                    key={student.id}
                    className={student.suspended ? "is-inactive" : ""}
                    onClick={() => openStudent(student.id)}
                  >
                    {/* A number is a fixed width and a name is not, so they
                        no longer share a cell: read down a column, a number
                        set under a name is never twice in the same place,
                        which is the one thing it is looked up by. */}
                    <td className="admin-col-id">
                      {student.studentNumber ?? <span className="admin-cell__quiet">—</span>}
                    </td>

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
                          {/* Only where there is no number to identify them by,
                              which is the case the line was there for. */}
                          {student.studentNumber ? null : (
                            <div className="admin-person__id">{student.email}</div>
                          )}
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
                            {activity.lastActive.kind === "quiz" ? "exam" : "lesson"}
                          </span>
                        </>
                      ) : (
                        <span className="admin-count admin-count--none">Never</span>
                      )}
                    </td>
                    <td className="is-center">
                      <AccountStatusPill status={statusOf(student)} />
                    </td>
                    <td className="admin-table__chevron">
                      <StatusMenu
                        name={student.name}
                        status={statusOf(student)}
                        busy={busy}
                        onChange={(status) => changeStatus(student, status)}
                        onDelete={() => askToDelete(student)}
                      />
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr className="admin-table__empty">
                  {/* A filtered-to-nothing table says something different from
                      a search that missed, and an admin needs to know which
                      of the two they are looking at. */}
                  <td colSpan={8}>
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

      <Pagination page={page} pageCount={pageCount} onChange={setPage} label="Students" />

      {newLogin ? <NewPasswordModal {...newLogin} onClose={() => setNewLogin(null)} /> : null}

      {deleting ? (
        <ConfirmDeleteModal
          title="Delete this student?"
          subject={`${deleting.name}${deleting.studentNumber ? ` · ${deleting.studentNumber}` : ""}`}
          losses={studentLosses(impact)}
          keeps={studentKeeps(impact)}
          busy={busy}
          confirmLabel="Delete student"
          confirmWord="CONFIRM"
          error={deleteError}
          onCancel={closeDelete}
          onConfirm={removeStudent}
        />
      ) : null}

      {form ? (
        <StudentForm
          student={form === "new" ? null : form}
          busy={busy}
          error={formError}
          onCancel={() => setForm(null)}
          onSave={saveStudent}
          onImport={importStudents}
        />
      ) : null}
    </div>
  );
}

export default StudentsManagement;
