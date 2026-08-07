import { useEffect, useMemo, useState } from "react";
import {
  enrollStudent,
  fetchCourses,
  fetchStudent,
  fetchStudents,
  unenrollStudent
} from "../../services/admin";
import { ChevronRightIcon, UserIcon } from "./components/icons";
import {
  AdminButton,
  Avatar,
  BackLink,
  PageHeader,
  ProgressRow,
  SearchField,
  StatTile,
  StatusPill
} from "./components/ui";

function StudentsManagement() {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [coursePick, setCoursePick] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([fetchStudents(), fetchCourses()])
      .then(([studentList, courseList]) => {
        if (!active) return;
        setStudents(studentList);
        setCourses(courseList);
        setCoursePick(courseList[0]?.id ?? "");
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
    fetchStudent(studentId)
      .then((student) => {
        setSelected(student);
        setDetailStatus("ready");
      })
      .catch(() => setDetailStatus("error"));
  };

  const runAction = async (action) => {
    setBusy(true);
    try {
      const updated = await action();
      setSelected(updated);
      // Keep the list in step with the change.
      setStudents((list) =>
        list.map((s) => (s.id === updated.id ? { ...s, enrolled: updated.enrolled } : s))
      );
    } catch (_error) {
      // Leave the current view untouched if the write fails.
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) =>
      `${student.name} ${student.studentNumber ?? ""} ${student.program ?? ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [students, query]);

  if (selected) {
    const enrolled = selected.enrolled ?? [];
    const progress = selected.progress ?? [];

    return (
      <div className="admin-main__inner">
        <BackLink onClick={() => setSelected(null)}>Students Management</BackLink>

        {detailStatus === "loading" ? (
          <p className="admin-empty-note">Loading student…</p>
        ) : detailStatus === "error" ? (
          <p className="admin-empty-note">Couldn&apos;t load this student.</p>
        ) : (
          <>
            <div className="admin-identity">
              <div className="admin-identity__disc">
                <UserIcon size={46} color="var(--brand)" />
              </div>
              <div>
                <div className="admin-identity__row">
                  <h1 className="admin-identity__name">{selected.name}</h1>
                  <StatusPill label={selected.status} />
                </div>
                <p className="admin-identity__meta">
                  {[selected.studentNumber, selected.program, selected.year]
                    .filter(Boolean)
                    .join(" · ") || selected.email}
                </p>
              </div>
            </div>

            <div className="admin-grid-2">
              <section className="admin-card">
                <h2 className="admin-card__title">Enrolled Courses</h2>

                <div className="admin-assign-list">
                  {enrolled.map((course) => (
                    <div className="admin-assign-row" key={course.id}>
                      <div>
                        <span className="admin-assign-row__title">{course.title}</span>
                        <span className="admin-assign-row__meta">{course.code}</span>
                      </div>
                      <button
                        type="button"
                        className="admin-chip-btn"
                        disabled={busy}
                        onClick={() =>
                          runAction(() => unenrollStudent(selected.id, course.id))
                        }
                        aria-label={`Unenroll from ${course.title}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {enrolled.length === 0 ? (
                    <p className="admin-empty-note">Not enrolled in any course yet.</p>
                  ) : null}
                </div>

                <div className="admin-assign-form">
                  <select
                    className="admin-select"
                    value={coursePick}
                    aria-label="Course to enroll"
                    onChange={(event) => setCoursePick(event.target.value)}
                  >
                    {courses.map((course) => (
                      <option value={course.id} key={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                  <AdminButton
                    variant="admin-btn--compact"
                    disabled={busy || !coursePick}
                    onClick={() => runAction(() => enrollStudent(selected.id, coursePick))}
                  >
                    Enroll
                  </AdminButton>
                </div>
              </section>

              <section className="admin-card">
                <h2 className="admin-card__title">Assessment Progress</h2>

                <div className="admin-stats">
                  <StatTile value={selected.credentials ?? 0} label="Micro-credentials" />
                  <StatTile value={enrolled.length} label="Active courses" />
                </div>

                <div className="admin-progress-list">
                  {progress.map((item) => (
                    <ProgressRow key={item.label} label={item.label} pct={item.pct} />
                  ))}
                  {progress.length === 0 ? (
                    <p className="admin-empty-note">No module progress recorded yet.</p>
                  ) : null}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="admin-main__inner">
      <PageHeader
        title="Students Management"
        subtitle="Select a student to view enrolled courses and credentials"
      />

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search students…"
        label="Search students"
      />

      {status === "loading" ? (
        <div className="admin-state-card">Loading students…</div>
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
                <th>Program</th>
                <th>Year</th>
                <th className="is-center">Courses</th>
                <th>Status</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => (
                <tr key={student.id} onClick={() => openStudent(student.id)}>
                  <td>
                    <div className="admin-person">
                      <Avatar name={student.name} />
                      <div>
                        <div className="admin-person__name">{student.name}</div>
                        <div className="admin-person__id">
                          {student.studentNumber ?? student.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{student.program ?? "—"}</td>
                  <td>{student.year ?? "—"}</td>
                  <td className="is-center">{student.enrolled.length}</td>
                  <td>
                    <StatusPill label={student.status} />
                  </td>
                  <td className="admin-table__chevron">
                    <button
                      type="button"
                      className="admin-table__open"
                      onClick={(event) => {
                        event.stopPropagation();
                        openStudent(student.id);
                      }}
                      aria-label={`Open ${student.name}`}
                    >
                      <ChevronRightIcon />
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr className="admin-table__empty">
                  <td colSpan={6}>No students match your search.</td>
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
