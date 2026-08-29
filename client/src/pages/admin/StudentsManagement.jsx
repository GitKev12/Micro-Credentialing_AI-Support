import { useEffect, useMemo, useState } from "react";
import {
  fetchCourses,
  fetchStudent,
  fetchStudents,
  setStudentSuspended,
  updateStudent,
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
 * "Last active 15 Aug 2026 · submitted a quiz".
 *
 * Enrolment only says a student was signed up. This says whether they have
 * turned up since, which is the question this screen is usually open to answer.
 */
function lastActiveLabel(lastActive) {
  const when = formatDate(lastActive?.at);
  if (!when) return "No activity recorded yet";

  return `Last active ${when} · ${
    lastActive.kind === "quiz" ? "submitted a quiz" : "finished a lesson"
  }`;
}

/** "Latest: Binary Search Trees · Aug 20, 2026" — for a tile that counts them. */
function latestLine(name, at) {
  const when = formatDate(at);
  return `Latest: ${name}${when ? ` · ${when}` : ""}`;
}

/**
 * One row per enrolled course, carrying everything the record says about that
 * course: how far through it the student is, how many of its badges they hold,
 * and who assesses it.
 *
 * These arrived as four separate lists because they were four separate cards.
 * They are one table now, so they are joined back together here — on course id,
 * which every one of them carries, rather than on the course title they happen
 * to print.
 */
function courseRows(enrolled, progress, badges, assessors) {
  const progressBy = new Map(progress.map((row) => [String(row.courseId ?? ""), row]));

  // Badges key on the course they belong to, but a badge written before its
  // course had an id keys on the code instead, so both are looked up.
  const badgesById = new Map(badges.map((row) => [String(row.courseId ?? ""), row]));
  const badgesByCode = new Map(badges.map((row) => [String(row.code ?? ""), row]));

  // Assessors arrive per assessor, listing the courses they cover; the table
  // reads the other way round.
  const assessorsByCourse = new Map();
  assessors.forEach((assessor) => {
    (assessor.courses ?? []).forEach((course) => {
      const key = String(course.id ?? "");
      if (!assessorsByCourse.has(key)) assessorsByCourse.set(key, []);
      assessorsByCourse.get(key).push(assessor.name);
    });
  });

  return enrolled.map((course) => ({
    ...course,
    progress: progressBy.get(String(course.id)) ?? null,
    badges: badgesById.get(String(course.id)) ?? badgesByCode.get(String(course.code)) ?? null,
    assessors: assessorsByCourse.get(String(course.id)) ?? []
  }));
}

/** How far through a course, as a figure and the bar that shows it. */
function ProgressCell({ progress }) {
  const total = progress?.total ?? 0;
  if (total === 0) {
    return <span className="admin-count admin-count--none">No lessons yet</span>;
  }

  const pct = Math.max(0, Math.min(100, progress.pct ?? 0));
  const detail = `${progress.completed} of ${total} · ${pct}%`;

  return (
    <div className="admin-cell-progress">
      <span className="admin-cell-progress__figure">{detail}</span>
      <div
        className="admin-progress__track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Lessons finished: ${detail}`}
      >
        <div className="admin-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

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


/**
 * Correct an existing student's details.
 *
 * Editing only — this console does not create accounts, so there is no blank
 * version of this form. An empty password box means "keep the current one"
 * rather than "clear it", and says so: a form that silently blanked a password
 * because a name was being fixed would lock someone out without ever saying it
 * had.
 */
function StudentForm({ student, busy, error, onCancel, onSave }) {
  const [firstName, setFirstName] = useState(student?.name?.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(
    student?.name?.split(" ").slice(1).join(" ") ?? ""
  );
  const [email, setEmail] = useState(student?.email ?? "");
  const [studentNumber, setStudentNumber] = useState(student?.studentNumber ?? "");
  const [password, setPassword] = useState("");

  const passwordOk = password === "" || password.length >= MIN_PASSWORD_LENGTH;
  const ready = firstName.trim() && lastName.trim() && email.trim() && passwordOk;

  return (
    <AdminModal
      title="Edit student"
      subtitle={student.name}
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
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim(),
                studentNumber: studentNumber.trim(),
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

      <AdminField label="First name" value={firstName} onChange={setFirstName} required />
      <AdminField label="Last name" value={lastName} onChange={setLastName} required />
      <AdminField
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        required
        hint="Also how they sign in."
      />
      <AdminField
        label="Student number"
        value={studentNumber}
        onChange={setStudentNumber}
        placeholder="e.g. 202300007"
      />
      {/* No program or year. A degree batch is not what a micro-credential is
          awarded against, so the form does not collect one. */}
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
    const enrolled = selected.enrolled ?? [];
    const progress = selected.progress ?? [];
    const badges = selected.badges ?? { earned: 0, total: 0, courses: [], latest: null };
    const assessors = selected.assessors ?? [];
    const rows = courseRows(enrolled, progress, badges.courses ?? [], assessors);
    const latestCredential = progress
      .filter((row) => row.total > 0 && row.pct === 100 && row.completedAt)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];

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
                {/* A degree batch belongs to a registrar, not to a
                    micro-credential record — the student number and a way to
                    reach them are what this screen actually needs. */}
                <p className="admin-identity__meta">
                  {[selected.studentNumber, selected.email].filter(Boolean).join(" · ")}
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

            <div className="admin-detail-stack">
              <section className="admin-card">
                <div className="admin-stats admin-stats--flush admin-stats--compact">
                  <StatTile
                    value={badges.earned ?? 0}
                    label="Badges earned"
                    note={
                      badges.latest
                        ? latestLine(badges.latest.name, badges.latest.earnedAt)
                        : null
                    }
                  />
                  <StatTile
                    value={selected.credentials ?? 0}
                    label="Micro-credentials"
                    note={
                      latestCredential
                        ? latestLine(latestCredential.label, latestCredential.completedAt)
                        : null
                    }
                  />
                  <StatTile value={enrolled.length} label="Active courses" />
                </div>
              </section>

              {/* One row per course, because the course is the record this system
                  keeps: a credential is earned per course, and progress, badges
                  and an assessor are all facts about one. They were four cards
                  that had to be read against each other to answer a question
                  about a single course; the row answers it across.

                  Read-only — enrolment is made on Classes Management, where a
                  student joins a course by being put in one of its classes. */}
              <section className="admin-table-card">
                <div className="admin-table-head">
                  <h2 className="admin-card__title">Enrolled Courses</h2>
                  <p className="admin-empty-note">
                    Set on Classes Management — a student is enrolled by being added to a class.
                  </p>
                </div>

                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Code</th>
                      <th>Progress</th>
                      <th className="is-center">Badges</th>
                      <th>Assessor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr className="admin-table__static" key={row.id}>
                        <td>
                          <span className="admin-cell__quiet">{row.title}</span>
                        </td>
                        <td>
                          <span className="admin-cell__quiet">{row.code}</span>
                        </td>
                        <td>
                          <ProgressCell progress={row.progress} />
                        </td>
                        <td className="is-center">
                          {row.badges && row.badges.total > 0 ? (
                            <span
                              className="admin-count admin-count--badges"
                              data-earned={row.badges.earned > 0 ? "yes" : "no"}
                            >
                              {row.badges.earned} of {row.badges.total}
                            </span>
                          ) : (
                            <span className="admin-count admin-count--none">None yet</span>
                          )}
                        </td>
                        <td>
                          {row.assessors.length > 0 ? (
                            <span className="admin-cell__quiet">{row.assessors.join(", ")}</span>
                          ) : (
                            <span className="admin-count admin-count--none">Unassigned</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 ? (
                      <tr className="admin-table__empty">
                        <td colSpan={5}>
                          Not enrolled in any course yet — add this student to a class.
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
          <StudentForm
            student={form}
            busy={busy}
            error={formError}
            onCancel={() => setForm(null)}
            onSave={saveStudent}
          />
        ) : null}
      </div>
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
