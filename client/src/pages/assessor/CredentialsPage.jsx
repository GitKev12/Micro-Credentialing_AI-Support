import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAssessorClasses,
  fetchPendingCredentials,
  issueCredential,
  storedAssessorId
} from "../../services/assessors";
import { useNotice } from "../../lib/useNotice";
import { CheckIcon } from "./components/icons";
import {
  AssessorSelect,
  Chip,
  LoadFailed,
  Notice,
  Person,
  ScreenHeader,
  SearchField
} from "./components/ui";
import { SkeletonText } from "../../components/Skeleton";

/**
 * Why the table is empty, which is never only one answer.
 *
 * Nothing waiting is the good news an assessor came for; nothing *found* is a
 * filter standing in the way, and the two must not be told apart wrongly — an
 * empty course reading as an empty queue would say the work was done.
 *
 * A search and a course narrow the list together, so a search that finds
 * nothing while a course is picked has only searched that course: the student
 * may be in the queue and standing on another one. Naming the course is what
 * keeps the line from claiming more than it has looked at.
 */
function emptyLine({ waiting, course, searching }) {
  if (!waiting) return "No credentials are waiting for release.";

  if (searching) {
    return course
      ? "No student on this course matches that search."
      : "No student in the queue matches that search.";
  }

  return "No credentials are waiting for release on this course.";
}

function CredentialsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);

  // The queue stands across every course an assessor teaches, so it is narrowed
  // here rather than fetched again: every row is already in hand, and a course
  // or a name is a question about the list, not a different read of it.
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [query, setQuery] = useState("");
  const [issued, setIssued] = useState({});
  const [issuing, setIssuing] = useState({});
  const [notice, setNotice] = useNotice();
  const [isLoading, setIsLoading] = useState(true);
  // A read that did not come back, and the counter that asks for it again.
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    const assessorId = storedAssessorId();
    if (!assessorId) {
      setIsLoading(false);
      return undefined;
    }

    fetchPendingCredentials(assessorId)
      .then((list) => {
        if (active) setRows(list);
      })
      .catch(() => {
        if (!active) return;
        setRows([]);
        setFailed(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reload]);

  // The assessor's own courses, for the picker. The same list the classes and
  // results screens read, so a course is named the same way on all three.
  useEffect(() => {
    let active = true;
    const assessorId = storedAssessorId();
    if (!assessorId) return undefined;

    fetchAssessorClasses(assessorId)
      .then((list) => {
        if (active) setCourses(list);
      })
      .catch(() => {
        // The queue is the screen; a picker that could not be built narrows
        // nothing and is left empty rather than taking the table down with it.
        if (active) setCourses([]);
      });

    return () => {
      active = false;
    };
  }, []);

  /**
   * The queue as it is being read: this course, and this name.
   *
   * A released row stays where it is until the next read — it turns into
   * "Issued today" rather than vanishing under the cursor — so the filter has
   * nothing to say about whether a credential has gone out.
   */
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (courseId && row.courseId !== courseId) return false;
      if (!term) return true;
      return row.name.toLowerCase().includes(term) || (row.sid ?? "").includes(term);
    });
  }, [rows, courseId, query]);

  const issue = async (row) => {
    setIssuing((current) => ({ ...current, [row.id]: true }));
    try {
      await issueCredential(storedAssessorId(), row.id);
      setIssued((current) => ({ ...current, [row.id]: true }));
      // Nothing is said on the way through: the row itself turns into
      // "Issued today", and a message repeating that would only be in the
      // way. A standing failure from an earlier try is cleared, though — it
      // is no longer true of this student.
      setNotice(null);
    } catch {
      // The button is left as it was so the release can be tried again. On
      // its own that read as a button that does nothing: the assessor pressed
      // it, the screen did not move, and there was no way to tell a refusal
      // from a slow network. The failure has to say it failed.
      setNotice({
        tone: "error",
        text: `Couldn't issue ${row.name}'s credential. Try again.`
      });
    } finally {
      setIssuing((current) => ({ ...current, [row.id]: false }));
    }
  };

  const awaitingCount = rows.filter((row) => !issued[row.id]).length;

  return (
    <>
      <ScreenHeader
        back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
        eyebrow={`${awaitingCount} awaiting release`}
        title="Credentials"
      />

      <div className="assessor-body assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
        <Notice notice={notice} />

        {/* Which course, and which student in it. The count in the header is
            the queue's own and does not move with these: it says how much work
            is standing, which is not a question about what is on screen. */}
        <div className="assessor-pickers">
          <div className="gen-field">
            <span className="field-label">Course</span>
            <AssessorSelect
              label="Course"
              value={courseId}
              onChange={setCourseId}
              options={[
                { value: "", label: "All courses" },
                ...courses.map((course) => ({
                  value: course.id,
                  label: course.name,
                  meta: course.code
                }))
              ]}
              placeholder="No courses assigned"
            />
          </div>

          <div className="gen-field gen-field--find">
            <span className="field-label">Find a student</span>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Search student or ID number"
              label="Search students"
            />
          </div>
        </div>

        <div className="assessor-table-wrap">
          <table className="assessor-table assessor-table--creds">
            <caption className="assessor-sr-only">
              Passed finals whose credential has not been released yet, with the
              score each was passed on and the mark it was passed against.
            </caption>

            <thead>
              <tr>
                <th scope="col">Student #</th>
                <th scope="col">Student</th>
                <th scope="col">Credential</th>
                <th scope="col">Score</th>
                <th scope="col">Result</th>
                <th scope="col">
                  <span className="assessor-sr-only">Release</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <td className="assessor-table__num">
                    {row.sid || <span className="assessor-table__dash">—</span>}
                  </td>

                  <th scope="row">
                    <Person as="span" name={row.name} />
                  </th>

                  <td className="assessor-table__paper">
                    <span className="assessor-table__name">{row.credential}</span>
                    <span className="assessor-table__sub">
                      {row.courseCode} · {row.assessmentTitle}
                    </span>
                  </td>

                  <td className="assessor-table__num">
                    {row.score}/{row.totalPoints}
                  </td>

                  {/* What the pass was measured against. The score alone does not
                      say whether it was a near miss or a clear one, and that is
                      the whole question in front of the assessor here. */}
                  <td>
                    <Chip tone="info">Passed · {row.passMark} to pass</Chip>
                  </td>

                  <td className="assessor-table__open">
                    {issued[row.id] ? (
                      <span className="btn btn--ghost" role="status">
                        <CheckIcon />
                        Issued today
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={Boolean(issuing[row.id])}
                        onClick={() => issue(row)}
                      >
                        {issuing[row.id] ? "Issuing…" : "Issue credential"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {isLoading ? (
                <tr>
                  <td className="assessor-table__empty" colSpan={6}>
                    <SkeletonText lines={4} label="Loading credentials…" />
                  </td>
                </tr>
              ) : null}

              {!isLoading && shown.length === 0 ? (
                <tr>
                  <td className="assessor-table__empty" colSpan={6}>
                    {failed ? (
                      <LoadFailed
                        what="The credentials queue"
                        onRetry={() => setReload((n) => n + 1)}
                      />
                    ) : (
                      emptyLine({
                        waiting: rows.length > 0,
                        course: Boolean(courseId),
                        searching: Boolean(query.trim())
                      })
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default CredentialsPage;
