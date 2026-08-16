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
  AdminSelect,
  Avatar,
  BackLink,
  PageHeader,
  ProgressRow,
  SearchField,
  StatTile,
  StatusPill
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
                <div className="admin-identity__row">
                  <h1 className="admin-identity__name">{selected.name}</h1>
                  <StatusPill label={selected.status} />
                </div>
                {/* The year belongs to the degree batch rather than to a
                    micro-credential record — the student number and a way to
                    reach them are what this screen actually needs. */}
                <p className="admin-identity__meta">
                  {[selected.studentNumber, selected.email].filter(Boolean).join(" · ")}
                </p>
                <p className="admin-identity__meta">{lastActiveLabel(selected.lastActive)}</p>
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
                <th>Status</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => {
                const courseCount = student.enrolled?.length ?? 0;

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
                        unenrolled student is the row worth acting on. Marked
                        with weight and colour rather than a pill: the Status
                        column next door owns the pill vocabulary here, and two
                        amber pills side by side read as one smear. */}
                    <td className="is-center">
                      {courseCount > 0 ? (
                        <span className="admin-count">{courseCount}</span>
                      ) : (
                        <span className="admin-count admin-count--none">None</span>
                      )}
                    </td>
                    <td>
                      <StatusPill label={student.status} />
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
                  <td colSpan={4}>
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
