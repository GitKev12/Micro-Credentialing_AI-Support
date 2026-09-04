import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchClassRoster,
  setRosterStudentSuspended,
  storedAssessorId
} from "../../services/assessors";
import { noticeClass, useNotice } from "../../lib/useNotice";
import { ChevronRightIcon } from "./components/icons";
import {
  CredentialDots,
  Person,
  ProgressBar,
  ScreenHeader,
  SearchField
} from "./components/ui";

/**
 * The students on one course, and what each of them can do.
 *
 * Status used to count the credentials nobody had issued yet — "2 to approve".
 * That is a queue, not a status, and it is answered properly on the Credentials
 * screen; the column now says whether this student can open the course at all.
 *
 * The switch closes this course to one student. It shuts the same amount as
 * switching their whole class off does — the lessons, the quizzes and the tick
 * that completes a lesson — and it shuts nothing else: they still sign in, keep
 * their other courses, and keep their enrolment, their progress and every badge
 * they have earned here. Turning it back on restores them as they were.
 *
 * It is not the admin console's suspension, which is on the account and stops
 * somebody signing in at all. An assessor owns a course, not an account, so the
 * labels here say the course out loud.
 *
 * A student on the course with no class behind them has nowhere for this to be
 * recorded — the server keeps it on the class — so their switch is closed
 * rather than offered a press that would be refused.
 */
function RosterPage() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState(null);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // What the last switch did, or why it did nothing. Closing a course on
  // somebody is not a change you should have to go and verify somewhere else
  // — and three seconds later it takes itself away again.
  const [notice, setNotice] = useNotice();

  useEffect(() => {
    let active = true;
    const assessorId = storedAssessorId();
    if (!assessorId || !courseId) {
      setIsLoading(false);
      return undefined;
    }

    fetchClassRoster(assessorId, courseId)
      .then((data) => {
        if (!active) return;
        setCourse(data?.course ?? null);
        setStudents(data?.roster ?? []);
        setTotal(data?.totalModules ?? 0);
        setClasses(data?.classes ?? []);
      })
      .catch(() => {
        if (active) setStudents([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [courseId]);

  const roster = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return students;
    return students.filter(
      (student) =>
        student.name.toLowerCase().includes(term) || (student.sid ?? "").includes(term)
    );
  }, [query, students]);

  const openStudent = (student) =>
    navigate(`/assessor/classes/${courseId}/students/${student.id}`);

  // What the notices call this course. Its code is the short name staff use.
  const courseName = course?.code || course?.name || "This course";

  /**
   * Close this course to a student, or open it again.
   *
   * The row moves first and goes back if the write is refused, so the switch
   * answers the press rather than waiting on the server to agree.
   */
  const toggleSuspended = async (student) => {
    const next = !student.suspended;
    const patch = (suspended) => (list) =>
      list.map((row) => (row.id === student.id ? { ...row, suspended } : row));

    setStudents(patch(next));
    setBusy(true);
    setNotice(null);

    try {
      await setRosterStudentSuspended(storedAssessorId(), courseId, student.id, next);
      setNotice({
        tone: "ok",
        text: next
          ? `${courseName} is closed for ${student.name}. They keep their account and their other courses.`
          : `${courseName} is open again for ${student.name}.`
      });
    } catch (error) {
      setStudents(patch(student.suspended));
      setNotice({
        tone: "error",
        text:
          error?.response?.data?.message ??
          `Couldn't change ${student.name}'s access to this course.`
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScreenHeader
        back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
        title={course ? `${course.name} — Students` : "Students"}
        eyebrow={
          course
            ? [course.code, course.section, classes.map((cls) => cls.name).join(" · ")]
                .filter(Boolean)
                .join(" · ")
            : ""
        }
      >
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search student or ID number"
          label="Search students"
        />
      </ScreenHeader>

      <div className="assessor-body assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
        {notice ? (
          <p className={noticeClass(notice, `assessor-notice assessor-notice--${notice.tone}`)} role="status">
            {notice.text}
          </p>
        ) : null}

        <div className="row-head roster-grid">
          <span>Student</span>
          <span>Module progress</span>
          <span>Badges</span>
          <span>Status</span>
          <span />
        </div>

        {roster.map((student) => {
          const pct = total > 0 ? Math.round((student.done / total) * 100) : 0;
          // Nowhere to record a closure: the server keeps it on the class.
          const noClass = (student.classes ?? []).length === 0;

          return (
            /*
             * A container rather than one big button, which is what it used to
             * be: the switch inside it is a button, and a button cannot hold
             * another. The row still opens the student for the mouse; the
             * chevron beside it is the same trip by keyboard, and the switch
             * stops its own press from reaching either.
             */
            <div
              key={student.id}
              className="data-row data-row--clickable roster-grid"
              onClick={() => openStudent(student)}
            >
              <Person
                name={student.name}
                sid={
                  classes.length > 1
                    ? [student.sid, ...(student.classes ?? [])].filter(Boolean).join(" · ")
                    : student.sid
                }
              />

              <ProgressBar label={`${student.done} of ${total} modules`} pct={pct} />

              <CredentialDots earned={student.creds} total={total} />

              <span>
                <button
                  type="button"
                  className={`roster-switch${student.suspended ? "" : " is-on"}`}
                  role="switch"
                  aria-checked={!student.suspended}
                  disabled={busy || noClass}
                  /* The visible word is the state, which on its own names a
                     dozen identical switches the same thing. The student goes
                     in front of it rather than replacing it, so what is read
                     out still contains what is written on the control. */
                  aria-label={`${student.name} — ${student.suspended ? "Suspended" : "Active"}`}
                  title={
                    noClass
                      ? `${student.name} is on this course without a class, so there is nothing to close`
                      : student.suspended
                        ? `Open ${courseName} for ${student.name} again`
                        : `Close ${courseName} for ${student.name} — their account and their other courses are not affected`
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleSuspended(student);
                  }}
                >
                  <span className="roster-switch__track">
                    <span className="roster-switch__thumb" />
                  </span>
                  <span className="roster-switch__label">
                    {student.suspended ? "Suspended" : "Active"}
                  </span>
                </button>
              </span>

              <button
                type="button"
                className="roster-open"
                aria-label={`Open ${student.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  openStudent(student);
                }}
              >
                <ChevronRightIcon size={18} />
              </button>
            </div>
          );
        })}

        {!isLoading && roster.length === 0 ? (
          <p className="assessor-meta" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
            {students.length === 0 ? "No students are enrolled yet." : "No students match your search."}
          </p>
        ) : null}
      </div>
    </>
  );
}

export default RosterPage;
