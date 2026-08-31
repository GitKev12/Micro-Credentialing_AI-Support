import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAssessorClasses,
  fetchAssessorOverview,
  storedAssessorId
} from "../../services/assessors";
import { ChevronRightIcon, CredentialIcon, GenerateIcon } from "./components/icons";
import { Chip, ScreenHeader, StatCard } from "./components/ui";
import { formatCourseLength, formatCourseRange } from "../../lib/courseDuration";

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
  expected: 0,
  posted: 0,
  issued: 0,
  awaiting: 0
};

function ClassesPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({ toPost: 0, credentials: 0 });
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
        setSummary(overview?.summary ?? { toPost: 0, credentials: 0 });
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
          expected: sum.expected + (course.assessmentsExpected ?? 0),
          posted: sum.posted + (course.assessmentsPosted ?? 0),
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
            value={summary.toPost}
            label="Assessments to Post"
            action="Generate Assessment"
            icon={<GenerateIcon />}
            onAction={() => navigate("/assessor/generate")}
          />
          <StatCard
            value={summary.credentials}
            label="Credentials"
            action="Approve & Issue"
            icon={<CredentialIcon />}
            onAction={() => navigate("/assessor/credentials")}
          />
        </div>

        {/* A class register, which is what a course list is in an LMS: one row
            per class, and one column per thing the assessor has to decide on —
            how big the class is, how much of it there is, how many of its
            papers are out, what has come out of it, and when it was last
            active. */}
        <section className="assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
          <h2 className="assessor-h2">Your Classes</h2>

          <div className="assessor-table-wrap">
            <table className="assessor-table">
              <caption className="assessor-sr-only">
                Classes assigned to you, with enrolment, lesson counts, run dates,
                assessments posted and credentials issued.
              </caption>

              <thead>
                <tr>
                  <th scope="col">Course</th>
                  <th scope="col" className="assessor-table__num">Students</th>
                  <th scope="col" className="assessor-table__num">Lessons</th>
                  <th scope="col">Duration</th>
                  <th scope="col" className="assessor-table__num">Assessments</th>
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
                  const runRange = formatCourseRange(course);
                  const runLength = formatCourseLength(course);
                  const expected = course.assessmentsExpected ?? 0;
                  const postedPapers = course.assessmentsPosted ?? 0;
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

                      <td className="assessor-table__when">
                        {runRange ? (
                          <>
                            {runRange}
                            {runLength ? (
                              <span className="assessor-table__sub">{runLength}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="assessor-table__dash">—</span>
                        )}
                      </td>

                      {/* Posted out of expected — one paper per lesson plus the
                          course's final. A class is ready when the two match. */}
                      <td className="assessor-table__num">
                        {expected ? (
                          <Chip tone={postedPapers >= expected ? "info" : "brand"}>
                            {postedPapers}/{expected}
                          </Chip>
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
                    <td />
                    <td className="assessor-table__num">
                      {totals.posted}/{totals.expected}
                    </td>
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
