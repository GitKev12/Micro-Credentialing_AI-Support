import { useEffect, useMemo, useState } from "react";
import {
  assignCourse,
  fetchAssessor,
  fetchAssessors,
  fetchCourses,
  unassignCourse
} from "../../services/admin";
import { ChevronRightIcon, UserIcon } from "./components/icons";
import {
  AdminButton,
  Avatar,
  BackLink,
  PageHeader,
  SearchField,
  StatTile,
  StatusPill
} from "./components/ui";

function AssessorsManagement() {
  const [assessors, setAssessors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [coursePick, setCoursePick] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([fetchAssessors(), fetchCourses()])
      .then(([assessorList, courseList]) => {
        if (!active) return;
        setAssessors(assessorList);
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

  const openAssessor = (assessorId) => {
    setDetailStatus("loading");
    setSelected({ id: assessorId });
    fetchAssessor(assessorId)
      .then((assessor) => {
        setSelected(assessor);
        setDetailStatus("ready");
      })
      .catch(() => setDetailStatus("error"));
  };

  const runAction = async (action) => {
    setBusy(true);
    try {
      const updated = await action();
      setSelected(updated);
      setAssessors((list) =>
        list.map((a) => (a.id === updated.id ? { ...a, assigned: updated.assigned } : a))
      );
    } catch (_error) {
      // Leave the current view untouched if the write fails.
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return assessors;
    return assessors.filter((assessor) =>
      `${assessor.name} ${assessor.assessorNumber ?? ""} ${assessor.email ?? ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [assessors, query]);

  if (selected) {
    const assigned = selected.assigned ?? [];

    return (
      <div className="admin-main__inner">
        <BackLink onClick={() => setSelected(null)}>Assessors Management</BackLink>

        {detailStatus === "loading" ? (
          <p className="admin-empty-note">Loading assessor…</p>
        ) : detailStatus === "error" ? (
          <p className="admin-empty-note">Couldn&apos;t load this assessor.</p>
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
                  {[selected.assessorNumber, selected.email].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>

            <div className="admin-grid-2">
              <section className="admin-card">
                <h2 className="admin-card__title">Assigned Courses</h2>

                <div className="admin-assign-list">
                  {assigned.map((course) => (
                    <div className="admin-assign-row" key={course.id}>
                      <div>
                        <span className="admin-assign-row__title">{course.title}</span>
                        <span className="admin-assign-row__meta">{course.section}</span>
                      </div>
                      <button
                        type="button"
                        className="admin-chip-btn"
                        disabled={busy}
                        onClick={() =>
                          runAction(() => unassignCourse(selected.id, course.id))
                        }
                        aria-label={`Unassign ${course.title}`}
                      >
                        Unassign
                      </button>
                    </div>
                  ))}
                  {assigned.length === 0 ? (
                    <p className="admin-empty-note">No courses assigned yet.</p>
                  ) : null}
                </div>

                <div className="admin-assign-form">
                  <select
                    className="admin-select"
                    value={coursePick}
                    aria-label="Course to assign"
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
                    onClick={() => runAction(() => assignCourse(selected.id, coursePick))}
                  >
                    Assign
                  </AdminButton>
                </div>
              </section>

              <section className="admin-card">
                <h2 className="admin-card__title">Teaching Load</h2>

                <div className="admin-stats">
                  <StatTile value={assigned.length} label="Assigned courses" />
                  <StatTile value={selected.students ?? 0} label="Students" />
                </div>

                <h3 className="admin-card__subtitle">Classes</h3>
                <div className="admin-module-list">
                  {assigned.map((course) => (
                    <div className="admin-module-row" key={course.id}>
                      <span className="admin-module-row__label">{course.title}</span>
                      <span className="admin-assign-row__meta">{course.section}</span>
                    </div>
                  ))}
                  {assigned.length === 0 ? (
                    <p className="admin-empty-note">No classes to show.</p>
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
        title="Assessors Management"
        subtitle="Select an assessor to view assigned courses and classes"
      />

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search assessors…"
        label="Search assessors"
      />

      {status === "loading" ? (
        <div className="admin-state-card">Loading assessors…</div>
      ) : status === "error" ? (
        <div className="admin-state-card admin-state-card--error">
          Couldn&apos;t reach the API. Check that the server is running.
        </div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Assessor</th>
                <th className="is-center">Courses</th>
                <th className="is-center">Students</th>
                <th>Status</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {visible.map((assessor) => (
                <tr key={assessor.id} onClick={() => openAssessor(assessor.id)}>
                  <td>
                    <div className="admin-person">
                      <Avatar name={assessor.name} />
                      <div>
                        <div className="admin-person__name">{assessor.name}</div>
                        <div className="admin-person__id">
                          {assessor.assessorNumber ?? assessor.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="is-center">{assessor.assigned.length}</td>
                  <td className="is-center">
                    <strong className="admin-strong-brand">{assessor.students}</strong>
                  </td>
                  <td>
                    <StatusPill label={assessor.status} />
                  </td>
                  <td className="admin-table__chevron">
                    <button
                      type="button"
                      className="admin-table__open"
                      onClick={(event) => {
                        event.stopPropagation();
                        openAssessor(assessor.id);
                      }}
                      aria-label={`Open ${assessor.name}`}
                    >
                      <ChevronRightIcon />
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr className="admin-table__empty">
                  <td colSpan={6}>No assessors match your search.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AssessorsManagement;
