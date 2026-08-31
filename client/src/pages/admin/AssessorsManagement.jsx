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
import { SkeletonDetail, SkeletonTable } from "../../components/Skeleton";

function formatDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * "Last posted 15 Aug 2026", or "Last graded 15 Aug 2026".
 *
 * Being assigned six courses says what an assessor was given. This says
 * whether they have done any of it — the question the screen is usually open
 * to answer.
 *
 * It named only grading, which was the whole job when marking was all an
 * assessor did here. Writing and posting a course's papers is now the bulk of
 * their console, and reporting only the other half said "has not graded
 * anything yet" about someone who had been working all week.
 */
const ACTIVITY_LABELS = { posted: "Last posted", graded: "Last graded" };

/**
 * "16 days ago", "3 weeks ago", "5 months ago".
 *
 * Deliberately coarser than the assessor console's `timeAgo`, which falls back
 * to a bare date after a week: the date is already on this line, and what a
 * date alone does not answer is how long the account has been quiet — which is
 * the question an admin opens the screen with.
 */
function agoLabel(value) {
  if (!value) return null;

  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return null;

  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  if (days < 31) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }

  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function lastActiveLabel(lastActive) {
  const when = formatDate(lastActive?.at);
  if (!when) return "Has not posted or graded anything yet";

  const label = `${ACTIVITY_LABELS[lastActive.kind] ?? "Last active"} ${when}`;
  const ago = agoLabel(lastActive.at);
  return ago ? `${label} · ${ago}` : label;
}

/** What the last thing they did was, for the row under the date. */
function activityKindLabel(kind) {
  if (kind === "posted") return "posted an assessment";
  return kind === "graded" ? "released a grade" : null;
}

/**
 * "6 of 9 posted · 2 drafts written".
 *
 * The number still owed does not on its own separate an assessor who has never
 * opened the generator from one who has written every paper and posted all but
 * two, and those are different conversations.
 */
function papersNote(workload) {
  if (!workload.papersExpected) return null;

  const posted = `${workload.papersPosted} of ${workload.papersExpected} posted`;
  if (!workload.papersDraft) return posted;

  const drafts =
    workload.papersDraft === 1 ? "1 draft written" : `${workload.papersDraft} drafts written`;
  return `${posted} · ${drafts}`;
}

/**
 * "9 assessments to post and 3 credentials to issue", either half dropped when
 * it is zero. Only ever read on a suspended account, where the work is the
 * consequence of the suspension rather than a workload figure.
 */
function backlogPhrase(workload) {
  const parts = [];

  if (workload.toPost > 0) {
    parts.push(`${workload.toPost} assessment${workload.toPost === 1 ? "" : "s"} to post`);
  }
  if (workload.credentialsPending > 0) {
    const n = workload.credentialsPending;
    parts.push(`${n} credential${n === 1 ? "" : "s"} to issue`);
  }

  return parts.join(" and ");
}

// The two categories that are not a course: everyone, and everyone with no
// course at all. The students list is narrowed by the same two.
const CATEGORY_ALL = "all";
const CATEGORY_NONE = "none";

// The three parts of the job, in the order the assessor's own rail runs them:
// write and post a course's papers, release the marks, issue the credentials.
const EMPTY_WORKLOAD = {
  papersExpected: 0,
  papersPosted: 0,
  papersDraft: 0,
  toPost: 0,
  credentialsPending: 0,
  credentialsIssued: 0
};

const EMPTY_COVERAGE = { unassigned: [], shared: [], unposted: [] };

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
        placeholder="Leave blank to keep the current one"
      />
    </AdminModal>
  );
}

function AssessorsManagement() {
  const [assessors, setAssessors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [coverage, setCoverage] = useState(EMPTY_COVERAGE);
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

    return (
      <div className="admin-main__inner">
        <BackLink onClick={() => setSelected(null)}>Assessors Management</BackLink>

        {detailStatus === "loading" ? (
          <SkeletonDetail label="Loading assessor…" />
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
                <p className="admin-identity__meta">{lastActiveLabel(selected.lastActive)}</p>
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

            {/* The pill above says the account is locked and the tiles below
                say what it owes, and until now nothing joined the two. A
                suspended assessor cannot sign in, so their share of the work
                is not late — it is stopped, and the courses under it are
                silent for as long as the suspension stands. */}
            {selected.suspended && backlogPhrase(workload) ? (
              <p className="admin-notice admin-notice--warn" role="status">
                <strong>Suspended with work outstanding</strong> — {backlogPhrase(workload)}.
              </p>
            ) : null}

            <div className="admin-detail-stack">
              <section className="admin-card">
                {/* The two numbers the assessor's own console reports about
                    itself, in the order it runs them. Papers first, because
                    nothing else can happen until something is posted: no
                    student can take a quiz, so no mark arrives to release and
                    no credential comes of it. */}
                <div className="admin-stats admin-stats--flush admin-stats--compact">
                  <StatTile
                    value={workload.toPost}
                    label="Assessments to post"
                    note={papersNote(workload)}
                  />
                  <StatTile
                    value={workload.credentialsPending}
                    label="Credentials to issue"
                    note={
                      workload.credentialsIssued > 0
                        ? `${workload.credentialsIssued} issued so far`
                        : null
                    }
                  />
                </div>
              </section>

              {/* One row per assigned course, because the course is the unit of
                  work here: a paper is written for a course and posted to all
                  of it at once, and the marks and credentials that follow are
                  counted against that one. The courses and the numbers about
                  them used to be two cards that had to be read against each
                  other to answer a question about a single course.

                  Read-only — assignment is made on Classes Management, where an
                  assessor takes a course by being put on one of its classes. */}
              <section className="admin-table-card">
                <div className="admin-table-head">
                  <h2 className="admin-card__title">Assigned Courses</h2>
                </div>

                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Code</th>
                      <th className="is-center">Students</th>
                      <th className="is-center">Assessments posted</th>
                      <th className="is-center">To issue</th>
                      <th className="is-center">Issued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((row) => {
                      return (
                        <tr className="admin-table__static" key={row.id}>
                          <td>
                            <span className="admin-cell__quiet">{row.title || row.code}</span>
                            {/* Qualifies every figure on the row, so it sits on
                                the course rather than on any one column: the
                                counts are the course's, and a co-assessor's
                                posting shows here as though it were this
                                assessor's own. */}
                            {row.sharedWith > 0 ? (
                              <span className="admin-cell__sub">
                                Shared with {row.sharedWith} other assessor
                                {row.sharedWith === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <span className="admin-cell__quiet">{row.code}</span>
                          </td>
                          <td className="is-center">{row.students}</td>
                          {/* Against what the course owes, not on its own: six
                              papers is most of the way through a five-lesson
                              course and barely started on a twenty-lesson one. */}
                          <td className="is-center">
                            <span
                              className={`admin-count${row.toPost > 0 ? " admin-count--warn" : ""}`}
                            >
                              {row.papersPosted} / {row.papersExpected}
                            </span>
                            {row.papersDraft > 0 ? (
                              <span className="admin-cell__sub">
                                {row.papersDraft === 1 ? "1 draft" : `${row.papersDraft} drafts`}
                              </span>
                            ) : null}
                          </td>
                          <td className="is-center">
                            <span
                              className={`admin-count${
                                row.credentialsPending > 0 ? " admin-count--warn" : ""
                              }`}
                            >
                              {row.credentialsPending}
                            </span>
                          </td>
                          <td className="is-center">
                            <strong className="admin-strong-brand">{row.credentialsIssued}</strong>
                          </td>
                        </tr>
                      );
                    })}
                    {classes.length === 0 ? (
                      <tr className="admin-table__empty">
                        <td colSpan={6}>
                          Not assigned to any course yet.
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
        </p>
      ) : null}

      {/* A course can now be fully staffed and still be silent. A generated
          paper used to be live the moment it existed; posting is the assessor's
          own act, so an assigned course can go a whole term with nothing its
          students are able to open — and that looks identical from every other
          screen in the console. */}
      {coverage.unposted.length > 0 ? (
        <p className="admin-notice admin-notice--warn" role="status">
          <strong>
            {coverage.unposted.length === 1
              ? "1 course has no assessment posted"
              : `${coverage.unposted.length} courses have no assessment posted`}
          </strong>{" "}
          — {coverage.unposted.map((course) => course.code || course.title).join(", ")}. Their
          students have nothing to take.
        </p>
      ) : null}

      {/* Follows the warnings rather than riding the search row: a shared course
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
        <SkeletonTable rows={6} cols={8} label="Loading assessors…" />
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
                <th className="is-center">To post</th>
                <th className="is-center">To issue</th>
                <th>Last active</th>
                <th className="is-center">Status</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {visible.map((assessor) => {
                const workload = assessor.workload ?? EMPTY_WORKLOAD;
                const active = formatDate(assessor.lastActive?.at);
                const activeKind = activityKindLabel(assessor.lastActive?.kind);

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
                    {/* Papers owed. This is the assessor's own rail badge, and
                        the first thing an admin needs off this row: until it
                        reaches zero their classes have nothing to take, and
                        every column after it will read clear for that reason
                        rather than because the work is done. */}
                    <td className="is-center">
                      {workload.papersExpected === 0 ? (
                        <span className="admin-count admin-count--none">None</span>
                      ) : workload.toPost > 0 ? (
                        <>
                          <span className="admin-count admin-count--warn">{workload.toPost}</span>
                          <span className="admin-cell__sub">of {workload.papersExpected}</span>
                        </>
                      ) : (
                        <span className="admin-cell__quiet">All posted</span>
                      )}
                    </td>
                    {/* A released pass still leaves the credential itself to
                        issue, and that is the last thing a student waits on. */}
                    <td className="is-center">
                      {workload.credentialsPending > 0 ? (
                        <span className="admin-count admin-count--warn">
                          {workload.credentialsPending}
                        </span>
                      ) : (
                        <span className="admin-cell__quiet">Clear</span>
                      )}
                    </td>
                    <td>
                      {active ? (
                        <>
                          <span className="admin-cell__quiet">{active}</span>
                          {activeKind ? (
                            <span className="admin-cell__sub">{activeKind}</span>
                          ) : null}
                        </>
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
                  <td colSpan={8}>
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
