import { useEffect, useMemo, useState } from "react";
import {
  fetchAssessmentResults,
  fetchAssessorClasses,
  fetchCourseAssessments,
  fetchStudentPaper,
  storedAssessorId
} from "../../services/assessors";
import {
  AssessorSelect,
  Chip,
  LoadFailed,
  Person,
  ScreenHeader,
  SearchField
} from "./components/ui";
import { ChevronRightIcon, FilterIcon } from "./components/icons";
import StudentPaper from "./components/StudentPaper";
import { Skeleton, SkeletonText } from "../../components/Skeleton";

/**
 * What came back off a paper, student by student.
 *
 * The generate screen answers how many; this answers who. Two pickers name the
 * paper — the course, then the quiz within it — and everything under them is
 * about that one paper.
 *
 * Every enrolled student has a row whether they have touched the paper or not.
 * The list is the class register — surname first, alphabetical — so a name is
 * found by running down the column rather than reading the whole of it.
 *
 * An unposted paper is offered but shut. Leaving it out would be worse — the
 * assessor would look for a quiz they know they wrote and not find it — so it
 * is listed with the reason it cannot be opened, which is that nobody has been
 * given it yet.
 */

/** The words a status is written in, and how it is drawn. */
const STATUS = {
  "not-started": { label: "Not started", tone: "outline" },
  "in-progress": { label: "In progress", tone: "brand-soft" },
  submitted: { label: "Submitted", tone: "success" }
};

/* The same three states the chips carry, off the same map, so a filter and the
   column it filters can never come to be worded differently.

   Off, the control says what it does rather than what it is not doing: a
   funnel and the word Filter. The row that turns it back off is named for the
   count tile it corresponds to — All students — so the four rows of the list
   are the four tiles standing above the table, in their order. */
const STATUS_OPTIONS = [
  { value: "", label: "All students", triggerLabel: "Filter" },
  ...Object.entries(STATUS).map(([value, { label }]) => ({ value, label }))
];

/**
 * Why the table is empty, which is never only one answer.
 *
 * A search and a state narrow the register together, so a search that finds
 * nobody while a state is picked has only searched that state — saying the
 * student is not on the course would claim more than has been looked at.
 */
function emptyLine({ assessment, enrolled, searching, filtered }) {
  if (!assessment) return "Choose an assessment to see how the class has got on with it.";
  if (!enrolled) return "No students are enrolled on this course yet.";
  if (searching) {
    return filtered
      ? "No student in that state matches that search."
      : "No student on this course matches that search.";
  }
  return "Nobody on this course is in that state.";
}

function formatWhen(iso) {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;

  return {
    day: when.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  };
}

/** A date over the time it happened at, or a dash where it never did. */
function WhenCell({ iso }) {
  const when = formatWhen(iso);
  if (!when) return <span className="assessor-table__dash">—</span>;

  return (
    <>
      {when.day}
      <span className="assessor-table__sub">{when.time}</span>
    </>
  );
}

/**
 * Every lesson of one course, and the final, as options for the picker.
 *
 * All of them, not only the ones with a paper: the list is the course, and an
 * assessor scanning it for a lesson should find the lesson. What varies is
 * whether it can be opened, and `meta` says which of the three reasons it is —
 * out, written but not out, or not written at all. Only a posted paper has
 * results, so only a posted paper can be chosen; the rest are greyed with the
 * reason on them, which is more use than leaving them out and letting somebody
 * hunt for a quiz they remember writing.
 */
function paperOptions(lessons, final) {
  const state = (paper) => {
    if (!paper) return { meta: "Not written", posted: false };
    if (paper.status === "posted") return { meta: "Posted", posted: true };
    return { meta: "Written, not posted", posted: false };
  };

  const rows = lessons.map((lesson) => {
    const { meta, posted } = state(lesson.assessment);
    return {
      // A lesson with no paper still needs a key of its own. It can never be
      // chosen, so the value only has to be unique.
      value: lesson.assessment?.id ?? `lesson:${lesson.moduleId}`,
      label: `${lesson.n}. ${lesson.title}`,
      meta,
      posted,
      disabled: !posted
    };
  });

  const finalState = state(final);
  rows.push({
    value: final?.id ?? "final:none",
    label: final?.title || "Final exam",
    meta: finalState.meta,
    posted: finalState.posted,
    disabled: !finalState.posted
  });

  return rows;
}

function ResultsPage() {
  const assessorId = storedAssessorId();

  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [papers, setPapers] = useState([]);
  const [assessmentId, setAssessmentId] = useState("");

  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [board, setBoard] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  // A register that did not come back. Emptying the table instead would say
  // this paper had no takers, which is a different and false answer.
  const [failed, setFailed] = useState(false);

  // The student whose paper is open, and what came back for them.
  const [openStudentId, setOpenStudentId] = useState(null);
  const [paper, setPaper] = useState(null);
  const [paperError, setPaperError] = useState("");
  const [isLoadingPaper, setIsLoadingPaper] = useState(false);

  useEffect(() => {
    if (!assessorId) return undefined;

    let active = true;
    fetchAssessorClasses(assessorId)
      .then((list) => {
        if (!active) return;
        setCourses(list);
        // One course is not a choice. Opening it saves a press that has only
        // one possible answer.
        if (list.length > 0) setCourseId((current) => current || list[0].id);
      })
      .catch(() => {
        if (active) setCourses([]);
      });

    return () => {
      active = false;
    };
  }, [assessorId]);

  // The chosen course's papers, and the first posted one opened for reading.
  useEffect(() => {
    if (!assessorId || !courseId) {
      setPapers([]);
      setAssessmentId("");
      return undefined;
    }

    let active = true;
    setPapers([]);
    setAssessmentId("");
    setBoard(null);

    fetchCourseAssessments(assessorId, courseId)
      .then((data) => {
        if (!active) return;
        const options = paperOptions(data.lessons ?? [], data.final ?? null);
        setPapers(options);
        setAssessmentId(options.find((option) => option.posted)?.value ?? "");
      })
      .catch(() => {
        if (active) setPapers([]);
      });

    return () => {
      active = false;
    };
  }, [assessorId, courseId]);

  const load = useMemo(
    () => async () => {
      if (!assessorId || !courseId || !assessmentId) {
        setBoard(null);
        return;
      }

      setIsLoading(true);
      setFailed(false);
      try {
        setBoard(await fetchAssessmentResults(assessorId, courseId, assessmentId));
      } catch {
        setBoard(null);
        setFailed(true);
      } finally {
        setIsLoading(false);
      }
    },
    [assessorId, courseId, assessmentId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // The open student's paper. Fetched rather than held back from the register,
  // which carries a row's score but never its questions.
  useEffect(() => {
    if (!openStudentId || !assessorId || !courseId || !assessmentId) return undefined;

    let active = true;
    setPaper(null);
    setPaperError("");
    setIsLoadingPaper(true);

    fetchStudentPaper(assessorId, courseId, assessmentId, openStudentId)
      .then((data) => {
        if (!active) return;
        if (data?.error) setPaperError(data.error);
        else setPaper(data);
      })
      .finally(() => {
        if (active) setIsLoadingPaper(false);
      });

    return () => {
      active = false;
    };
  }, [assessorId, courseId, assessmentId, openStudentId]);

  // Changing the paper or the course closes whatever was open on the old one.
  useEffect(() => {
    setOpenStudentId(null);
  }, [courseId, assessmentId]);

  const takers = board?.assessment?.takers ?? null;
  const rows = board?.rows ?? [];

  /**
   * The rows the search leaves standing.
   *
   * Only the table narrows. The four cards above it say how this paper stands
   * across the whole class, and a count that moved every time somebody typed a
   * name would be answering a different question from the one on its label.
   */
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (status && row.status !== status) return false;
      if (!term) return true;
      return row.name.toLowerCase().includes(term) || (row.sid ?? "").includes(term);
    });
  }, [query, status, rows]);

  /**
   * The register, or one paper off it.
   *
   * Opening a student replaces the table rather than sitting beside it. The
   * pickers stay in state while it is open, so coming back is the register as
   * it was — the same course, the same paper, the same search — which is what
   * makes reading three students in a row bearable.
   */
  if (openStudentId) {
    return (
      <>
        <ScreenHeader
          back={{ label: "Back to results", onClick: () => setOpenStudentId(null) }}
          title={paper?.assessment?.title ?? "Paper"}
        />

        <div className="assessor-body assessor-stack">
          {paperError ? <p className="gen-notice is-error">{paperError}</p> : null}
          {isLoadingPaper ? <SkeletonText lines={6} label="Loading the paper…" /> : null}
          {paper && !isLoadingPaper ? <StudentPaper {...paper} /> : null}
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="Results" />

      <div className="assessor-body assessor-stack" style={{ display: "flex", flexDirection: "column" }}>
        {takers ? (
          <ul className="gen-takers">
            <li className="gen-taker">
              <span className="gen-taker__value">{takers.all}</span>
              <span className="gen-taker__label">All students</span>
            </li>
            <li className="gen-taker gen-taker--waiting">
              <span className="gen-taker__value">{takers.notStarted}</span>
              <span className="gen-taker__label">Not started</span>
            </li>
            <li className="gen-taker gen-taker--working">
              <span className="gen-taker__value">{takers.inProgress}</span>
              <span className="gen-taker__label">In progress</span>
            </li>
            <li className="gen-taker gen-taker--done">
              <span className="gen-taker__value">{takers.submitted}</span>
              <span className="gen-taker__label">Submitted</span>
            </li>
          </ul>
        ) : isLoading ? (
          /* The row holds its place while the counts are fetched. Without it
             the cards appeared after the read and shoved the pickers and the
             table down the page, which moved the row the assessor had just
             started reading. */
          <ul className="gen-takers" role="status" aria-label="Loading the class counts…">
            {Array.from({ length: 4 }, (_, index) => (
              <li className="gen-taker" key={index} aria-hidden="true">
                <Skeleton w="2.25rem" h={22} />
                <Skeleton w="70%" h={9} />
              </li>
            ))}
          </ul>
        ) : null}

        {/* Which paper, and which student in it. Course first, because a quiz
            only means anything inside one. */}
        <div className="assessor-pickers">
          <div className="gen-field">
            <span className="field-label">Course</span>
            <AssessorSelect
              label="Course"
              value={courseId}
              onChange={setCourseId}
              options={courses.map((course) => ({
                value: course.id,
                label: course.name,
                meta: course.code
              }))}
              placeholder="No courses assigned"
            />
          </div>

          <div className="gen-field">
            <span className="field-label">Assessment</span>
            <AssessorSelect
              label="Assessment"
              value={assessmentId}
              onChange={setAssessmentId}
              options={papers}
              placeholder={papers.length === 0 ? "Nothing written yet" : "Choose an assessment"}
            />
          </div>

          {/* Beside the search rather than out with the course and the paper:
              those two say which register is being read, and these two narrow
              the one already on screen. They wrap as a pair for the same
              reason — split across two lines, the funnel would end up sitting
              above the field it belongs next to. */}
          <div className="assessor-pickers__pair">
            {/* No label over it: the control carries its own name, and a
                STATUS above a funnel reading Filter names the same thing
                twice. The screen-reader name says which filter it is. */}
            <div className="gen-field gen-field--state">
              <AssessorSelect
                label="Filter by status"
                value={status}
                onChange={setStatus}
                options={STATUS_OPTIONS}
                LeadIcon={FilterIcon}
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
        </div>

        <div className="assessor-table-wrap">
          <table className="assessor-table assessor-table--results">
            <caption className="assessor-sr-only">
              Every student on the course against this assessment, with how far
              they have got, what they answered and scored, and when they
              started and handed in.
            </caption>

            <thead>
              <tr>
                <th scope="col">Student #</th>
                <th scope="col">Student</th>
                <th scope="col">Answered</th>
                <th scope="col">Score</th>
                <th scope="col">Started</th>
                <th scope="col">Submitted</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="assessor-sr-only">Open paper</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {shown.map((row) => {
                const status = STATUS[row.status] ?? STATUS["not-started"];
                const opens = row.status === "submitted";

                return (
                  <tr
                    key={row.id}
                    className={opens ? "assessor-table__row" : undefined}
                    onClick={opens ? () => setOpenStudentId(row.id) : undefined}
                  >
                    <td className="assessor-table__num">
                      {row.sid || <span className="assessor-table__dash">—</span>}
                    </td>

                    <th scope="row">
                      <Person as="span" name={row.name} />
                    </th>

                    {/* Never known for somebody still working: their answers
                        are in their own browser until they hand in. A dash
                        says that; a nought would claim they answered none. */}
                    <td className="assessor-table__num">
                      {row.answered === null ? (
                        <span className="assessor-table__dash">—</span>
                      ) : (
                        `${row.answered}/${row.itemCount}`
                      )}
                    </td>

                    <td className="assessor-table__num">
                      {row.score === null ? (
                        <span className="assessor-table__dash">—</span>
                      ) : (
                        <span className={row.passed ? "results-score" : "results-score is-under"}>
                          {row.score}/{row.totalPoints}
                        </span>
                      )}
                    </td>

                    <td className="assessor-table__when">
                      <WhenCell iso={row.startedAt} />
                    </td>

                    <td className="assessor-table__when">
                      <WhenCell iso={row.submittedAt} />
                    </td>

                    <td>
                      <Chip tone={status.tone} dot={row.status !== "not-started"}>
                        {status.label}
                      </Chip>
                    </td>

                    {/* Only a handed-in paper opens: there is nothing to read
                        of a student who has not taken it, and a row that looked
                        pressable but was not would be worse than one that
                        plainly is not. The cell is empty on the rest, and those
                        rows take neither the pointer nor the hover.

                        The row is the target for a mouse; this is the same trip
                        by keyboard, and the thing that says at rest — without
                        having to be hovered first — that the row goes somewhere. */}
                    <td className="assessor-table__open">
                      {opens ? (
                        <button
                          type="button"
                          className="assessor-table__link"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenStudentId(row.id);
                          }}
                          aria-label={`Open ${row.name}'s paper`}
                        >
                          Open
                          <ChevronRightIcon size={16} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}

              {isLoading ? (
                <tr>
                  <td className="assessor-table__empty" colSpan={8}>
                    <SkeletonText lines={4} label="Loading results…" />
                  </td>
                </tr>
              ) : null}

              {!isLoading && shown.length === 0 ? (
                <tr>
                  <td className="assessor-table__empty" colSpan={8}>
                    {failed ? (
                      <LoadFailed what="These results" onRetry={load} />
                    ) : (
                      emptyLine({
                        assessment: Boolean(assessmentId),
                        enrolled: rows.length > 0,
                        searching: Boolean(query.trim()),
                        filtered: Boolean(status)
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

export default ResultsPage;
