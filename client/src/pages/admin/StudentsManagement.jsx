import { useEffect, useMemo, useState } from "react";
import {
  enrollStudent,
  fetchCourses,
  fetchStudent,
  fetchStudents,
  unenrollStudent,
  updateStudent,
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
  ProgressRow,
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
  const [coursePick, setCoursePick] = useState("");
  const [busy, setBusy] = useState(false);
  // Which enrolment is waiting on a "yes, remove", and the result of the last
  // write. Both mirror the Course Management screen, which already works this
  // way — removing an enrolment is no less worth confirming than removing a
  // module, and a failed write used to leave no trace at all.
  const [confirming, setConfirming] = useState(null);
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
    setNotice(null);
    setConfirming(null);
    fetchStudent(studentId)
      .then((student) => {
        setSelected(student);
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
      // Keep the list row in step with whatever changed.
      setStudents((list) => list.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
      setConfirming(null);
      setNotice({ tone: "ok", text: ok });
    } catch (error) {
      // This used to be swallowed, so a write that failed looked exactly like
      // one that worked — the row simply never changed.
      setNotice({ tone: "error", text: error?.response?.data?.message || fail });
    } finally {
      setBusy(false);
    }
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

    // Offering a course the student is already in gave the admin an action
    // that did nothing — the server de-duplicates with $addToSet, so it
    // reported success and changed nothing.
    const enrolledIds = new Set(enrolled.map((course) => course.id));
    const available = courses.filter((course) => !enrolledIds.has(course.id));
    // The selected id falls out of the list the moment it is enrolled, so the
    // <select> is driven by a pick that is always one of its own options.
    const activePick = available.some((course) => course.id === coursePick)
      ? coursePick
      : (available[0]?.id ?? "");

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
                <h1 className="admin-identity__name">{selected.name}</h1>
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

                      {confirming === course.id ? (
                        <div className="admin-assign-row__actions">
                          <span className="admin-module-row__warn">Remove enrolment?</span>
                          <button
                            type="button"
                            className="admin-chip-btn"
                            disabled={busy}
                            onClick={() =>
                              runAction(() => unenrollStudent(selected.id, course.id), {
                                ok: `${selected.name} was unenrolled from “${course.title}”.`,
                                fail: "Couldn't remove that enrolment. Try again."
                              })
                            }
                          >
                            Yes, remove
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
                          aria-label={`Unenroll from ${course.title}`}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  {enrolled.length === 0 ? (
                    <p className="admin-empty-note">Not enrolled in any course yet.</p>
                  ) : null}
                </div>

                <div className="admin-assign-form">
                  <AdminSelect
                    value={activePick}
                    onChange={setCoursePick}
                    label="Course to enroll"
                    disabled={busy || available.length === 0}
                    placeholder={
                      available.length === 0 ? "Enrolled in every course" : "Choose a course…"
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
                      runAction(() => enrollStudent(selected.id, activePick), {
                        ok: `${selected.name} was enrolled in “${course?.title ?? "the course"}”.`,
                        fail: "Couldn't enroll this student. Try again."
                      });
                    }}
                  >
                    Enroll
                  </AdminButton>
                </div>
              </section>

              <section className="admin-card">
                <h2 className="admin-card__title">Assessment Progress</h2>

                <div className="admin-stats">
                  <StatTile value={badges.earned ?? 0} label="Badges earned" />
                  <StatTile value={selected.credentials ?? 0} label="Micro-credentials" />
                  <StatTile value={enrolled.length} label="Active courses" />
                </div>

                <div className="admin-progress-list">
                  {progress.map((item) => (
                    <ProgressRow
                      key={item.label}
                      label={item.label}
                      pct={item.pct}
                      completed={item.completed}
                      total={item.total}
                    />
                  ))}
                  {progress.length === 0 ? (
                    <p className="admin-empty-note">No module progress recorded yet.</p>
                  ) : null}
                </div>
              </section>
            </div>

            <div className="admin-grid-2">
              <section className="admin-card">
                <h2 className="admin-card__title">Badges</h2>
                <p className="admin-card__subtitle">One per lesson, earned by passing its quiz</p>

                <div className="admin-assign-list">
                  {badges.courses.map((row) => (
                    <div className="admin-assign-row" key={row.courseId || row.code}>
                      <div>
                        <span className="admin-assign-row__title">{row.title || row.code}</span>
                        <span className="admin-assign-row__meta">{row.code}</span>
                      </div>
                      <span
                        className="admin-count admin-count--badges"
                        data-earned={row.earned > 0 ? "yes" : "no"}
                      >
                        {row.earned} of {row.total}
                      </span>
                    </div>
                  ))}
                  {badges.courses.length === 0 ? (
                    <p className="admin-empty-note">
                      No badges exist for this student&apos;s courses yet.
                    </p>
                  ) : null}
                </div>

                {badges.latest ? (
                  <p className="admin-empty-note">
                    Most recent: “{badges.latest.name}”
                    {formatDate(badges.latest.earnedAt)
                      ? ` · ${formatDate(badges.latest.earnedAt)}`
                      : ""}
                  </p>
                ) : null}
              </section>

              <section className="admin-card">
                <h2 className="admin-card__title">Assessors</h2>
                <p className="admin-card__subtitle">Assigned to the courses this student is in</p>

                <div className="admin-assign-list">
                  {assessors.map((assessor) => (
                    <div className="admin-assign-row" key={assessor.id}>
                      <div>
                        <span className="admin-assign-row__title">{assessor.name}</span>
                        <span className="admin-assign-row__meta">
                          {assessor.courses.map((course) => course.code).join(" · ")}
                        </span>
                      </div>
                    </div>
                  ))}
                  {assessors.length === 0 ? (
                    <p className="admin-empty-note">
                      {enrolled.length === 0
                        ? "Enrol this student in a course to see who assesses them."
                        : "No assessor is assigned to this student's courses yet."}
                    </p>
                  ) : null}
                </div>
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
        subtitle="Select a student to view enrolled courses and credentials"
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
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => {
                const courseCount = student.enrolled?.length ?? 0;
                const activity = student.activity ?? EMPTY_ACTIVITY;
                const seen = formatDate(activity.lastActive?.at);

                return (
                  <tr key={student.id} onClick={() => openStudent(student.id)}>
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
                  <td colSpan={6}>
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
