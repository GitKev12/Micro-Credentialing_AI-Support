import { useEffect, useMemo, useState } from "react";
import {
  assignCourse,
  fetchAssessor,
  fetchAssessors,
  fetchCourses,
  unassignCourse,
  updateAssessor,
  MIN_PASSWORD_LENGTH
} from "../../services/admin";
import { ChevronRightIcon, UserIcon } from "./components/icons";
import {
  AdminButton,
  AdminField,
  AdminModal,
  AdminSelect,
  Avatar,
  BackLink,
  PageHeader,
  SearchField,
  StatTile
} from "./components/ui";

function formatDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * How long the oldest unmarked paper has been sitting.
 *
 * A backlog of nine is a different problem depending on whether the oldest of
 * the nine arrived this morning or in June, and the count alone cannot say
 * which — this is the half that makes it actionable.
 */
function waitingLabel(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * "Last graded 15 Aug 2026".
 *
 * Being assigned six courses says what an assessor was given. This says
 * whether they have done any of it — the question the screen is usually open
 * to answer, and the one nothing here used to address.
 */
function lastGradedLabel(workload) {
  const when = formatDate(workload?.lastGraded);
  return when ? `Last graded ${when}` : "Has not graded anything yet";
}

const EMPTY_WORKLOAD = {
  toGrade: 0,
  flagged: 0,
  released: 0,
  credentials: 0,
  oldestWaiting: null,
  lastGraded: null
};

/**
 * Correct an existing assessor's details.
 *
 * Editing only, as with students — this console does not create accounts. An
 * empty password box keeps the current one rather than clearing it.
 */
function AssessorForm({ assessor, busy, error, onCancel, onSave }) {
  const [name, setName] = useState(assessor?.name ?? "");
  const [email, setEmail] = useState(assessor?.email ?? "");
  const [assessorNumber, setAssessorNumber] = useState(assessor?.assessorNumber ?? "");
  const [password, setPassword] = useState("");

  const passwordOk = password === "" || password.length >= MIN_PASSWORD_LENGTH;
  const ready = name.trim() && email.trim() && passwordOk;

  return (
    <AdminModal
      title="Edit assessor"
      subtitle={assessor.name}
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
                name: name.trim(),
                email: email.trim(),
                assessorNumber: assessorNumber.trim(),
                ...(password ? { password } : {})
              })
            }
          >
            {busy ? "Saving…" : "Save changes"}
          </AdminButton>
        </>
      }
    >
      {error ? (
        <p className="admin-notice admin-notice--error" role="status">
          {error}
        </p>
      ) : null}

      <AdminField label="Full name" value={name} onChange={setName} required />
      <AdminField
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        required
        hint="Also how they sign in."
      />
      <AdminField
        label="Assessor number"
        value={assessorNumber}
        onChange={setAssessorNumber}
        placeholder="e.g. ASS007"
      />
      <AdminField
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint={`Leave blank to keep their current password. Otherwise at least ${MIN_PASSWORD_LENGTH} characters.`}
      />
    </AdminModal>
  );
}

function AssessorsManagement() {
  const [assessors, setAssessors] = useState([]);
  const [coverage, setCoverage] = useState({ unassigned: [], shared: [] });
  const [courses, setCourses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [coursePick, setCoursePick] = useState("");
  const [busy, setBusy] = useState(false);
  // Which assignment is waiting on a "yes, remove", and the result of the last
  // write. Both mirror Students Management: dropping a course also drops that
  // course's students from the assessor's roster, which is worth a confirm,
  // and a write that failed used to leave no trace on screen at all.
  const [confirming, setConfirming] = useState(null);
  const [notice, setNotice] = useState(null);

  // The assessor whose details are being corrected, if any.
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    let active = true;

    Promise.all([fetchAssessors(), fetchCourses()])
      .then(([assessorData, courseList]) => {
        if (!active) return;
        setAssessors(assessorData.assessors);
        setCoverage(assessorData.coverage);
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
    setNotice(null);
    setConfirming(null);
    fetchAssessor(assessorId)
      .then((assessor) => {
        setSelected(assessor);
        setDetailStatus("ready");
      })
      .catch(() => setDetailStatus("error"));
  };

  const runAction = async (action, { ok, fail }) => {
    setBusy(true);
    setNotice(null);
    try {
      const updated = await action();
      setSelected(updated);
      setAssessors((list) => list.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      setConfirming(null);
      setNotice({ tone: "ok", text: ok });
    } catch (error) {
      setNotice({ tone: "error", text: error?.response?.data?.message || fail });
    } finally {
      setBusy(false);
    }
  };

  const saveAssessor = async (values) => {
    setBusy(true);
    setFormError(null);
    try {
      const saved = await updateAssessor(form.id, values);
      setAssessors((list) => list.map((a) => (a.id === saved.id ? { ...a, ...saved } : a)));
      setSelected((assessor) => (assessor ? { ...assessor, ...saved } : assessor));
      setNotice({ tone: "ok", text: `${saved.name}'s details were updated.` });
      setForm(null);
    } catch (error) {
      setFormError(error?.response?.data?.message || "Couldn't save this assessor. Try again.");
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
    const classes = selected.classes ?? [];
    const workload = selected.workload ?? EMPTY_WORKLOAD;
    const waiting = waitingLabel(workload.oldestWaiting);

    // Offering a course the assessor already has gave the admin an action that
    // did nothing: the server de-duplicates with $addToSet, so it reported
    // success and changed nothing.
    const assignedIds = new Set(assigned.map((course) => course.id));
    const available = courses.filter((course) => !assignedIds.has(course.id));
    const activePick = available.some((course) => course.id === coursePick)
      ? coursePick
      : (available[0]?.id ?? "");

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
                <h1 className="admin-identity__name">{selected.name}</h1>
                <p className="admin-identity__meta">
                  {[selected.assessorNumber, selected.email].filter(Boolean).join(" · ")}
                </p>
                <p className="admin-identity__meta">{lastGradedLabel(workload)}</p>
              </div>

              <div className="admin-identity__actions">
                <button
                  type="button"
                  className="admin-chip-btn admin-chip-btn--quiet"
                  disabled={busy}
                  onClick={() => {
                    setFormError(null);
                    setForm(selected);
                  }}
                >
                  Edit details
                </button>
              </div>
            </div>

            {notice ? (
              <p className={`admin-notice admin-notice--${notice.tone}`} role="status">
                {notice.text}
              </p>
            ) : null}

            <div className="admin-grid-2">
              <section className="admin-card">
                <h2 className="admin-card__title">Assigned Courses</h2>

                <div className="admin-assign-list">
                  {assigned.map((course) => (
                    <div className="admin-assign-row" key={course.id}>
                      <div>
                        <span className="admin-assign-row__title">{course.title}</span>
                        <span className="admin-assign-row__meta">{course.code}</span>
                      </div>

                      {confirming === course.id ? (
                        <div className="admin-assign-row__actions">
                          <span className="admin-module-row__warn">Unassign?</span>
                          <button
                            type="button"
                            className="admin-chip-btn"
                            disabled={busy}
                            onClick={() =>
                              runAction(() => unassignCourse(selected.id, course.id), {
                                ok: `“${course.title}” was unassigned from ${selected.name}.`,
                                fail: "Couldn't unassign that course. Try again."
                              })
                            }
                          >
                            Yes, unassign
                          </button>
                          <button
                            type="button"
                            className="admin-chip-btn admin-chip-btn--quiet"
                            disabled={busy}
                            onClick={() => setConfirming(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="admin-chip-btn"
                          disabled={busy}
                          onClick={() => setConfirming(course.id)}
                          aria-label={`Unassign ${course.title}`}
                        >
                          Unassign
                        </button>
                      )}
                    </div>
                  ))}
                  {assigned.length === 0 ? (
                    <p className="admin-empty-note">No courses assigned yet.</p>
                  ) : null}
                </div>

                <div className="admin-assign-form">
                  <AdminSelect
                    value={activePick}
                    onChange={setCoursePick}
                    label="Course to assign"
                    disabled={busy || available.length === 0}
                    placeholder={
                      available.length === 0 ? "Assigned to every course" : "Choose a course…"
                    }
                    options={available.map((course) => ({
                      value: course.id,
                      label: course.title,
                      meta: course.code
                    }))}
                  />
                  <AdminButton
                    variant="admin-btn--compact"
                    disabled={busy || !activePick}
                    onClick={() => {
                      const course = available.find((entry) => entry.id === activePick);
                      runAction(() => assignCourse(selected.id, activePick), {
                        ok: `“${course?.title ?? "The course"}” was assigned to ${selected.name}.`,
                        fail: "Couldn't assign that course. Try again."
                      });
                    }}
                  >
                    Assign
                  </AdminButton>
                </div>
              </section>

              <section className="admin-card">
                <h2 className="admin-card__title">Grading Workload</h2>
                <p className="admin-card__subtitle">Across every course assigned to them</p>

                <div className="admin-stats">
                  <StatTile value={workload.toGrade} label="To grade" />
                  <StatTile value={workload.flagged} label="Needs a decision" />
                  <StatTile value={workload.credentials} label="Credentials issued" />
                </div>

                <div className="admin-assign-list">
                  <div className="admin-assign-row">
                    <span className="admin-assign-row__title">Papers released</span>
                    <span className="admin-count">{workload.released}</span>
                  </div>
                  <div className="admin-assign-row">
                    <span className="admin-assign-row__title">Oldest paper waiting</span>
                    <span className={`admin-count${waiting ? " admin-count--warn" : ""}`}>
                      {waiting ?? "Nothing waiting"}
                    </span>
                  </div>
                </div>

                {workload.flagged > 0 ? (
                  <p className="admin-empty-note">
                    “Needs a decision” counts papers where the AI would not commit to a
                    verdict and the assessor has not yet ruled on it.
                  </p>
                ) : null}
              </section>
            </div>

            <section className="admin-card admin-card--stacked">
              <h2 className="admin-card__title">Classes</h2>
              <p className="admin-card__subtitle">What each assigned course is carrying</p>

              {classes.length === 0 ? (
                <p className="admin-empty-note">
                  Assign a course to see the work it carries.
                </p>
              ) : (
                <div className="admin-table-card admin-table-card--flush">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th className="is-center">Students</th>
                        <th className="is-center">To grade</th>
                        <th className="is-center">Needs a decision</th>
                        <th className="is-center">Released</th>
                        <th className="is-center">Credentials</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classes.map((row) => {
                        const oldest = waitingLabel(row.oldestWaiting);

                        return (
                          <tr key={row.id} className="admin-table__static">
                            <td>
                              <div className="admin-person__name">{row.title || row.code}</div>
                              <div className="admin-person__id">{row.code}</div>
                            </td>
                            <td className="is-center">{row.students}</td>
                            <td className="is-center">
                              <span className="admin-count">{row.toGrade}</span>
                              {oldest ? (
                                <span className="admin-cell__sub">oldest {oldest}</span>
                              ) : null}
                            </td>
                            <td className="is-center">
                              <span
                                className={`admin-count${row.flagged > 0 ? " admin-count--warn" : ""}`}
                              >
                                {row.flagged}
                              </span>
                            </td>
                            <td className="is-center">{row.released}</td>
                            <td className="is-center">
                              <strong className="admin-strong-brand">{row.credentials}</strong>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {form ? (
          <AssessorForm
            assessor={form}
            busy={busy}
            error={formError}
            onCancel={() => setForm(null)}
            onSave={saveAssessor}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="admin-main__inner">
      <PageHeader
        title="Assessors Management"
        subtitle="Select an assessor to view their courses and grading workload"
      />

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search assessors…"
        label="Search assessors"
        hint={`${visible.length} of ${assessors.length}`}
      />

      {/* An unassessed course is invisible everywhere else in the console: it
          looks normal from Course Management whether anyone grades it or not.
          This is the screen that can fix it, so this is where it is said. */}
      {coverage.unassigned.length > 0 ? (
        <p className="admin-notice admin-notice--warn" role="status">
          <strong>
            {coverage.unassigned.length === 1
              ? "1 course has no assessor"
              : `${coverage.unassigned.length} courses have no assessor`}
          </strong>{" "}
          — {coverage.unassigned.map((course) => course.code || course.title).join(", ")}.
          Submissions there will not reach anyone.
        </p>
      ) : null}

      {coverage.shared.length > 0 ? (
        <p className="admin-notice admin-notice--ok" role="status">
          Shared by more than one assessor:{" "}
          {coverage.shared
            .map((course) => `${course.code || course.title} (${course.assessors})`)
            .join(", ")}
          . Each of them sees the same submissions.
        </p>
      ) : null}

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
                <th className="is-center">To grade</th>
                <th>Last graded</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {visible.map((assessor) => {
                const workload = assessor.workload ?? EMPTY_WORKLOAD;
                const oldest = waitingLabel(workload.oldestWaiting);
                const graded = formatDate(workload.lastGraded);

                return (
                  <tr key={assessor.id} onClick={() => openAssessor(assessor.id)}>
                    <td>
                      <div className="admin-person">
                        <Avatar name={assessor.name} />
                        <div>
                          {/* The name is the control. The row click stays as a
                              mouse convenience, but it is a <tr> — nothing
                              focuses it, so the only keyboard path was the
                              chevron at the far end of the row. */}
                          <button
                            type="button"
                            className="admin-person__name admin-person__link"
                            onClick={(event) => {
                              event.stopPropagation();
                              openAssessor(assessor.id);
                            }}
                          >
                            {assessor.name}
                          </button>
                          <div className="admin-person__id">
                            {assessor.assessorNumber ?? assessor.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="is-center">
                      {assessor.assigned.length > 0 ? (
                        <span className="admin-count">{assessor.assigned.length}</span>
                      ) : (
                        <span className="admin-count admin-count--none">None</span>
                      )}
                    </td>
                    <td className="is-center">
                      <strong className="admin-strong-brand">{assessor.students}</strong>
                    </td>
                    {/* The count alone reads the same whether the queue built
                        up this morning or in June, so the age of the oldest
                        paper rides underneath it. */}
                    <td className="is-center">
                      {workload.toGrade > 0 ? (
                        <>
                          <span className="admin-count">{workload.toGrade}</span>
                          {oldest ? (
                            <span className="admin-cell__sub">oldest {oldest}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="admin-cell__quiet">Clear</span>
                      )}
                    </td>
                    <td>
                      {graded ? (
                        <span className="admin-cell__quiet">{graded}</span>
                      ) : (
                        <span className="admin-count admin-count--none">Never</span>
                      )}
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
                  <td colSpan={6}>
                    {query.trim()
                      ? "No assessors match your search."
                      : "No assessors have been added yet."}
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

export default AssessorsManagement;
