import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAssessorClasses, storedAssessorId } from "../../services/assessors";
import { readError } from "../../services/readError";
import { ChevronRightIcon } from "./components/icons";
import { Chip, LoadFailed, ScreenHeader } from "./components/ui";

/**
 * Generate Assessment — one row per class the assessor holds.
 *
 * A register, like the Classes screen it is read beside. It was a grid of
 * cards on the reasoning that a class is a decision rather than a record —
 * but the decision is made by comparing classes, which is the one thing a grid
 * of cards is bad at. Figures laid out separately, each in its own box, cannot
 * be read down; the same figures in columns can, and the class that is
 * furthest behind is the one the eye lands on.
 *
 * Which is why every figure here gets a column of its own, down to the two the
 * work is actually chosen by: what is drafted, and what is not written.
 *
 * The columns it shares with the Classes register are in the same order there,
 * because it is the same set of classes seen with a different question in mind.
 */

/** What a class is still waiting on. */
function state(course) {
  const expected = course.assessmentsExpected ?? 0;
  const posted = course.assessmentsPosted ?? 0;
  const written = course.assessmentsWritten ?? 0;
  const drafts = Math.max(0, written - posted);
  const missing = Math.max(0, expected - written);

  return { expected, posted, written, drafts, missing };
}

function GeneratePage() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // A read that did not come back, and the counter that asks for it again.
  // The whole refusal rather than a flag: the server says why, and a boolean
  // left the screen to guess — it always guessed the network.
  const [failure, setFailure] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setFailure(null);
    const assessorId = storedAssessorId();
    if (!assessorId) {
      setIsLoading(false);
      return undefined;
    }

    fetchAssessorClasses(assessorId)
      .then((rows) => {
        if (active) setClasses(rows);
      })
      .catch((error) => {
        if (!active) return;
        setClasses([]);
        setFailure(readError(error, "Your classes could not be loaded."));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reload]);

  const openCourse = (courseId) => navigate(`/assessor/generate/${courseId}`);

  return (
    <>
      <ScreenHeader title="Generate Assessment" />

      <div className="assessor-body assessor-stack">
        <div className="assessor-table-wrap">
          <table className="assessor-table">
            <caption className="assessor-sr-only">
              Your classes, with how many of the papers each one is owed have been
              posted, how many are drafted and waiting to post, and how many have
              not been written.
            </caption>

            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col" className="assessor-table__num">Students</th>
                <th scope="col" className="assessor-table__num">Lessons</th>
                <th scope="col" className="assessor-table__num">Assessments</th>
                <th scope="col" className="assessor-table__num">Drafts</th>
                <th scope="col" className="assessor-table__num">Not written</th>
                <th scope="col">
                  <span className="assessor-sr-only">Open class</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {classes.map((course) => {
                const { expected, posted, drafts, missing } = state(course);

                return (
                  <tr
                    key={course.id}
                    className="assessor-table__row"
                    onClick={() => openCourse(course.id)}
                  >
                    <th scope="row" className="assessor-table__course">
                      <span className="assessor-table__code">
                        {course.code}
                        {course.section ? ` · ${course.section}` : ""}
                      </span>
                      <span className="assessor-table__name">{course.name}</span>
                    </th>

                    <td className="assessor-table__num">{course.students ?? 0}</td>

                    <td className="assessor-table__num">
                      {course.lessons || <span className="assessor-table__dash">—</span>}
                    </td>

                    {/* Posted out of owed — one paper per lesson plus the
                        course's final. The same figure the Classes register
                        carries, so the two screens cannot disagree about how
                        far along a class is. */}
                    <td className="assessor-table__num">
                      {expected ? (
                        <Chip tone={posted >= expected ? "info" : "brand"}>
                          {posted}/{expected}
                        </Chip>
                      ) : (
                        <span className="assessor-table__dash">—</span>
                      )}
                    </td>

                    {/* What is left, in a column each, because they are
                        different jobs: a draft is written and needs posting,
                        a paper that is not written needs writing. They shared
                        a cell as two chips, which put the two figures on a
                        line that re-flowed with whatever the class happened to
                        be carrying — so neither could be read down the
                        register, which is the one thing this screen is for.

                        A course with no lessons owes no papers, and neither
                        figure means anything of it: that is the dash. Nought
                        of a class that does owe papers is a real nought and is
                        written out, at the weight of an empty cell. */}
                    <td className="assessor-table__num">
                      {expected === 0 ? (
                        <span className="assessor-table__dash">—</span>
                      ) : (
                        <span className={drafts === 0 ? "assessor-table__zero" : undefined}>
                          {drafts}
                        </span>
                      )}
                    </td>

                    <td className="assessor-table__num">
                      {expected === 0 ? (
                        <span className="assessor-table__dash">—</span>
                      ) : (
                        <span className={missing === 0 ? "assessor-table__zero" : undefined}>
                          {missing}
                        </span>
                      )}
                    </td>

                    <td className="assessor-table__open">
                      <button
                        type="button"
                        className="assessor-table__link"
                        onClick={(event) => {
                          event.stopPropagation();
                          openCourse(course.id);
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
                  <td className="assessor-table__empty" colSpan={7}>
                    Loading your classes…
                  </td>
                </tr>
              ) : null}

              {!isLoading && classes.length === 0 ? (
                <tr>
                  <td className="assessor-table__empty" colSpan={7}>
                    {failure ? (
                      <LoadFailed
                        what="Your classes"
                        reason={failure.message}
                        status={failure.status}
                        onRetry={() => setReload((n) => n + 1)}
                      />
                    ) : (
                      "No classes are assigned to you yet."
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

export default GeneratePage;
