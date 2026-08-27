import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAssessorClasses,
  fetchAssessorOverview,
  storedAssessorId
} from "../../services/assessors";
import { ChevronRightIcon, CredentialIcon, FlagIcon, QueueIcon } from "./components/icons";
import { Chip, ScreenHeader, StatCard } from "./components/ui";

/**
 * Three steps, not a paragraph.
 *
 * This used to be four dense sentences naming the module PDF, the Table of
 * Specification and the token limit — none of which an assessor does anything
 * about. What they need to know is who marks first, what they can change, and
 * when the student actually gets the credential.
 */
const HOW_GRADING_WORKS = {
  title: "How grading works",
  steps: [
    "The AI writes each quiz from the lesson, then marks the answers.",
    "You review the marks. Keep them, change any answer, or set your own grade.",
    "The student gets the credential only after you approve it."
  ],
  note: "If the AI cannot mark a paper, it says so on the submission and you grade that one yourself.",
  tags: ["AI marks first", "You can override", "You approve"]
};

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * When the class was last heard from.
 *
 * Counted in calendar days rather than elapsed hours: a paper handed in last
 * night reads as "Yesterday" at nine in the morning, which is how an assessor
 * reads their own week. Past a week the relative form stops helping, so it
 * becomes a date.
 */
function lastActivity(iso) {
  if (!iso) return "No submissions yet";

  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "No submissions yet";

  const days = Math.round((startOfDay(new Date()) - startOfDay(when)) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return when.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const EMPTY_TOTALS = {
  students: 0,
  lessons: 0,
  pending: 0,
  flagged: 0,
  issued: 0,
  awaiting: 0
};

function ClassesPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({ toGrade: 0, aiFlagged: 0, credentials: 0 });
  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const assessorId = storedAssessorId();
    if (!assessorId) {
      setIsLoading(false);
      return undefined;
    }

    Promise.all([fetchAssessorOverview(assessorId), fetchAssessorClasses(assessorId)])
      .then(([overview, classList]) => {
        if (!active) return;
        setSummary(overview?.summary ?? { toGrade: 0, aiFlagged: 0, credentials: 0 });
        setClasses(classList);
      })
      .catch(() => {
        if (active) setClasses([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // The footer row: the same columns, added up. Against a single class it would
  // only repeat the row above it, so it appears from two.
  const totals = useMemo(
    () =>
      classes.reduce(
        (sum, course) => ({
          students: sum.students + (course.students ?? 0),
          lessons: sum.lessons + (course.lessons ?? 0),
          pending: sum.pending + (course.pending ?? 0),
          flagged: sum.flagged + (course.flagged ?? 0),
          issued: sum.issued + (course.credentialsIssued ?? 0),
          awaiting: sum.awaiting + (course.credentialsPending ?? 0)
        }),
        EMPTY_TOTALS
      ),
    [classes]
  );

  const openClass = (courseId) => navigate(`/assessor/classes/${courseId}`);

  return (
    <>
      <ScreenHeader eyebrow="Assessor console" title="Classes" />

      <div className="assessor-body assessor-stack">
        <div className="stat-row">
          <StatCard
            value={summary.toGrade}
            label="To Grade"
            action="Open Queue"
            icon={<QueueIcon />}
            onAction={() => navigate("/assessor/queue")}
          />
          <StatCard
            value={summary.aiFlagged}
            label="AI Flagged"
            action="Review Flagged"
            icon={<FlagIcon />}
            onAction={() => navigate("/assessor/queue?filter=flagged")}
          />
          <StatCard
            value={summary.credentials}
            label="Credentials"
            action="Approve & Issue"
            icon={<CredentialIcon />}
            onAction={() => navigate("/assessor/credentials")}
          />
        </div>

        <section className="explainer">
          <h2 className="explainer__title">{HOW_GRADING_WORKS.title}</h2>

          <ol className="explainer__steps">
            {HOW_GRADING_WORKS.steps.map((step, index) => (
              <li className="explainer__step" key={step}>
                <span className="explainer__step-num" aria-hidden="true">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          <p className="explainer__note">{HOW_GRADING_WORKS.note}</p>

          <div className="explainer__tags">
            {HOW_GRADING_WORKS.tags.map((tag, index) => (
              <Chip key={tag} tone={index % 2 === 0 ? "info" : "brand-soft"} dot>
                {tag}
              </Chip>
            ))}
          </div>
        </section>

        {/* A class register, which is what a course list is in an LMS: one row
            per class, and one column per thing the assessor has to decide on —
            how big the class is, how much of it there is, what is waiting to be
            marked, what has come out of it, and when it was last active. */}
        <section className="assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
          <h2 className="assessor-h2">Your Classes</h2>

          <div className="assessor-table-wrap">
            <table className="assessor-table">
              <caption className="assessor-sr-only">
                Classes assigned to you, with enrolment, lesson counts, grading backlog
                and credentials issued.
              </caption>

              <thead>
                <tr>
                  <th scope="col">Course</th>
                  <th scope="col" className="assessor-table__num">Students</th>
                  <th scope="col" className="assessor-table__num">Lessons</th>
                  <th scope="col" className="assessor-table__num">To grade</th>
                  <th scope="col" className="assessor-table__num">AI flagged</th>
                  <th scope="col">Credentials</th>
                  <th scope="col">Last activity</th>
                  <th scope="col">
                    <span className="assessor-sr-only">Open class</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {classes.map((course) => {
                  const students = course.students ?? 0;
                  const lessons = course.lessons ?? 0;
                  const pending = course.pending ?? 0;
                  const flagged = course.flagged ?? 0;
                  const issued = course.credentialsIssued ?? 0;
                  const awaiting = course.credentialsPending ?? 0;

                  return (
                    <tr
                      key={course.id}
                      className="assessor-table__row"
                      onClick={() => openClass(course.id)}
                    >
                      <th scope="row" className="assessor-table__course">
                        <span className="assessor-table__code">
                          {course.code}
                          {course.section ? ` · ${course.section}` : ""}
                        </span>
                        <span className="assessor-table__name">{course.name}</span>
                      </th>

                      <td className="assessor-table__num">{students}</td>

                      <td className="assessor-table__num">
                        {lessons || <span className="assessor-table__dash">—</span>}
                      </td>

                      <td className="assessor-table__num">
                        {pending ? (
                          <Chip tone="brand">{pending}</Chip>
                        ) : (
                          <span className="assessor-table__dash">—</span>
                        )}
                      </td>

                      <td className="assessor-table__num">
                        {flagged ? (
                          <Chip tone="danger">{flagged}</Chip>
                        ) : (
                          <span className="assessor-table__dash">—</span>
                        )}
                      </td>

                      <td>
                        <span className="assessor-table__creds">
                          {issued} issued
                          {awaiting ? <Chip tone="outline">{awaiting} to approve</Chip> : null}
                        </span>
                      </td>

                      <td className="assessor-table__when">
                        {lastActivity(course.lastSubmission)}
                      </td>

                      <td className="assessor-table__open">
                        <button
                          type="button"
                          className="assessor-table__link"
                          onClick={(event) => {
                            event.stopPropagation();
                            openClass(course.id);
                          }}
                        >
                          Open
                          <ChevronRightIcon size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {isLoading ? (
                  <tr>
                    <td className="assessor-table__empty" colSpan={8}>
                      Loading your classes…
                    </td>
                  </tr>
                ) : null}

                {!isLoading && classes.length === 0 ? (
                  <tr>
                    <td className="assessor-table__empty" colSpan={8}>
                      No classes are assigned to you yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>

              {classes.length > 1 ? (
                <tfoot>
                  <tr>
                    <th scope="row">All classes</th>
                    <td className="assessor-table__num">{totals.students}</td>
                    <td className="assessor-table__num">{totals.lessons}</td>
                    <td className="assessor-table__num">{totals.pending}</td>
                    <td className="assessor-table__num">{totals.flagged}</td>
                    <td>
                      {totals.issued} issued
                      {totals.awaiting ? ` · ${totals.awaiting} to approve` : ""}
                    </td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

export default ClassesPage;
