import { useEffect, useMemo, useState } from "react";
import {
  fetchAssessor,
  fetchAssessors,
  fetchCourses,
  setAssessorSuspended,
  updateAssessor,
  MIN_PASSWORD_LENGTH
} from "../../services/admin";
import { CheckIcon, ChevronRightIcon, UserIcon } from "./components/icons";
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

// The two categories that are not a course: everyone, and everyone with no
// course at all. The students list is narrowed by the same two.
const CATEGORY_ALL = "all";
const CATEGORY_NONE = "none";

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
  const [courses, setCourses] = useState([]);
  const [coverage, setCoverage] = useState({ unassigned: [], shared: [] });
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(CATEGORY_ALL);

  const [selected, setSelected] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  // The result of the last write, which is now only an edit to the assessor's
  // own details. A write that failed used to leave no trace on screen at all.
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
    fetchAssessor(assessorId)
      .then((assessor) => {
        setSelected(assessor);
        setDetailStatus("ready");
      })
      .catch(() => setDetailStatus("error"));
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

  /**
   * Suspend this assessor, or let them back in.
   *
   * Written straight from the row, as on the student list, and just as
   * reversible — nothing is destroyed. A suspended assessor keeps their
   * account and their assigned courses; they simply cannot sign in, and the
   * papers waiting on them stay waiting. The row moves first and goes back if
   * the write fails.
   */
  const toggleSuspended = async (assessor) => {
    const next = !assessor.suspended;
    const patch = (list) =>
      list.map((row) => (row.id === assessor.id ? { ...row, suspended: next } : row));

    setAssessors(patch);
    setBusy(true);
    try {
      await setAssessorSuspended(assessor.id, next);
      setSelected((current) =>
        current && current.id === assessor.id ? { ...current, suspended: next } : current
      );
      setNotice({
        tone: "ok",
        text: `${assessor.name} is now ${next ? "suspended" : "active"}.`
      });
    } catch (error) {
      setAssessors((list) =>
        list.map((row) =>
          row.id === assessor.id ? { ...row, suspended: assessor.suspended } : row
        )
      );
      setNotice({
        tone: "error",
        text: error?.response?.data?.message || "Couldn't change this assessor's status."
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * The options behind the category dropdown, with how many assessors each
   * holds. One control whatever the catalog does — six courses and sixty read
   * the same way, which a row of chips cannot claim.
   */
  const categories = useMemo(() => {
    const perCourse = new Map(courses.map((course) => [course.id, 0]));
    let unassigned = 0;

    for (const assessor of assessors) {
      const assigned = assessor.assigned ?? [];
      if (assigned.length === 0) {
        unassigned += 1;
        continue;
      }
      for (const course of assigned) {
        perCourse.set(course.id, (perCourse.get(course.id) ?? 0) + 1);
      }
    }

    return [
      { id: CATEGORY_ALL, label: "All assessors", meta: `${assessors.length}` },
      ...courses.map((course) => ({
        id: course.id,
        label: course.title || course.code,
        meta: `${course.code} · ${perCourse.get(course.id) ?? 0}`
      })),
      { id: CATEGORY_NONE, label: "Not assigned to any course", meta: `${unassigned}` }
    ];
  }, [assessors, courses]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();

    return assessors.filter((assessor) => {
      const assigned = assessor.assigned ?? [];

      // The category narrows first, so the search only ever runs over the
      // rows already on screen.
      const inCategory =
        category === CATEGORY_ALL
          ? true
          : category === CATEGORY_NONE
            ? assigned.length === 0
            : assigned.some((course) => course.id === category);
      if (!inCategory) return false;
      if (!term) return true;

      return `${assessor.name} ${assessor.assessorNumber ?? ""} ${assessor.email ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [assessors, query, category]);

  if (selected) {
    const classes = selected.classes ?? [];
    const workload = selected.workload ?? EMPTY_WORKLOAD;
    const waiting = waitingLabel(workload.oldestWaiting);

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
                <h1 className="admin-identity__name">
                  {selected.name}
                  <span
                    className={`admin-status-pill${
                      selected.suspended ? " admin-status-pill--off" : ""
                    }`}
                  >
                    {selected.suspended ? "Suspended" : "Active"}
                  </span>
                </h1>
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

            <div className="admin-detail-stack">
              <section className="admin-card">
                <div className="admin-stats admin-stats--flush admin-stats--compact">
                  <StatTile
                    value={workload.toGrade}
                    label="To grade"
                    note={waiting ? `Oldest waiting ${waiting}` : null}
                  />
                  <StatTile
                    value={workload.flagged}
                    label="Needs a decision"
                    note={
                      workload.flagged > 0
                        ? "The AI would not commit to a verdict and nobody has ruled on it"
                        : null
                    }
                  />
                  <StatTile value={workload.released} label="Papers released" />
                  <StatTile value={workload.credentials} label="Credentials issued" />
                </div>
              </section>

              {/* One row per assigned course, because the course is the unit of
                  work here: the queue, the flags, the releases and the
                  credentials are all counted against one. The courses and the
                  numbers about them used to be two cards that had to be read
                  against each other to answer a question about a single course.

                  Read-only — assignment is made on Classes Management, where an
                  assessor takes a course by being put on one of its classes. */}
              <section className="admin-table-card">
                <div className="admin-table-head">
                  <h2 className="admin-card__title">Assigned Courses</h2>
                  <p className="admin-empty-note">
                    Set on Classes Management — an assessor is assigned by being added to a class.
                  </p>
                </div>

                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Code</th>
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
                        <tr className="admin-table__static" key={row.id}>
                          <td>
                            <span className="admin-cell__quiet">{row.title || row.code}</span>
                          </td>
                          <td>
                            <span className="admin-cell__quiet">{row.code}</span>
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
                    {classes.length === 0 ? (
                      <tr className="admin-table__empty">
                        <td colSpan={7}>
                          Not assigned to any course yet — add this assessor to a class.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            </div>
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
      />

      {/* Category first, then type. One dropdown holds any number of courses
          without growing sideways, which a row of chips does not. */}
      <div className="admin-toolbar">
        <div className="admin-toolbar__filter">
          <AdminSelect
            value={category}
            onChange={setCategory}
            label="Filter assessors by category"
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
            placeholder="Search assessors…"
            label="Search assessors"
            hint={`${visible.length} of ${assessors.length}`}
          />
        </div>

        {/* The switch is in the table, so what it did has to be sayable from
            the list — the detail screen's copy of this is never on screen when
            a row is toggled. */}
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

      {/* Follows the warning rather than riding the search row: a shared course
          is a fact about the list, not a problem to act on, and the toolbar is
          now the category-and-search row the students list uses. */}
      {coverage.shared.length > 0 ? (
        <p className="admin-notice admin-notice--note" role="status">
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
                <th className="is-center">Status</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {visible.map((assessor) => {
                const workload = assessor.workload ?? EMPTY_WORKLOAD;
                const oldest = waitingLabel(workload.oldestWaiting);
                const graded = formatDate(workload.lastGraded);

                return (
                  <tr
                    key={assessor.id}
                    className={assessor.suspended ? "is-inactive" : ""}
                    onClick={() => openAssessor(assessor.id)}
                  >
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
                    <td className="is-center">
                      <button
                        type="button"
                        className={`admin-switch${assessor.suspended ? "" : " is-on"}`}
                        role="switch"
                        aria-checked={!assessor.suspended}
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSuspended(assessor);
                        }}
                        title={
                          assessor.suspended
                            ? `Activate ${assessor.name}`
                            : `Suspend ${assessor.name}`
                        }
                      >
                        <span className="admin-switch__track">
                          <span className="admin-switch__thumb" />
                        </span>
                        <span className="admin-switch__label">
                          {assessor.suspended ? "Suspended" : "Active"}
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
                      ? "No assessors match your search."
                      : category === CATEGORY_NONE
                        ? "Every assessor is assigned to a course."
                        : "No assessors in this category yet."}
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
