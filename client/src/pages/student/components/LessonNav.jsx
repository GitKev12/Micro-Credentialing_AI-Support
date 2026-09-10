import { CheckIcon, ChevronDownIcon, LockIcon, QuizIcon } from "./icons";

/**
 * The lesson list in the learning-modules rail.
 *
 * Each module is a disclosure group: the row, an expandable panel holding that
 * module's sections, and then its quiz. The quiz used to live in a separate
 * full-width block under the reader, which put a module's quiz a whole page
 * away from the lesson it belongs to — the Assessment collection stores one
 * generated quiz per module, so it belongs with its module.
 *
 * The quiz sits outside the panel, not in it, so it is on screen without the
 * lesson being expanded. It is drawn even before a quiz has been generated:
 * the server sends a locked placeholder row for any lesson without one, which
 * is what makes the course's shape legible from the start.
 *
 * The panel and the row share one bordered group. An earlier version rendered
 * the section list as a sibling of the row, so it floated in the gap between
 * two modules with nothing tying it to its parent.
 *
 * Both a lesson and each of its sections carry how far it has been read. The
 * rail was only ever able to say finished or not, which is the one thing a
 * student part-way through a chapter already knows — the percentages are what
 * tell them which part of it they left off in. Completion is still the tick,
 * and still the server's; these come from the reader (see lessonProgress.js).
 */
function LessonNav({
  modules,
  isCompleted,
  selectedLessonId,
  selectedAssessmentId,
  activeSection,
  expandedId,
  sectionsByModule,
  sectionsLoadingId,
  assessmentsByModule,
  lessonProgressFor,
  sectionProgressFor,
  onSelectLesson,
  onToggleSections,
  onOpenSection,
  onOpenAssessment
}) {
  return (
    <ul className="sd-lesson-nav">
      {modules.map((module, index) => {
        // The lesson's own record: its text has been read to the end. Kept
        // apart from `finished` below because the quiz waits on this one, and
        // a quiz that waited on itself would never open.
        const readToEnd = isCompleted(module.id);
        const current = String(selectedLessonId) === String(module.id);
        const expanded = expandedId === module.id;
        const sections = sectionsByModule[module.id];
        const loading = !sections && sectionsLoadingId === module.id;
        const quizzes = assessmentsByModule[module.id] ?? [];
        const panelId = `lesson-sections-${module.id}`;
        // Reading and quiz together — half each, see lessonProgress.js.
        const read = lessonProgressFor?.(module.id) ?? 0;
        // The whole lesson, both halves of it. Only this fills the bullet in.
        const finished = read >= 100;

        const state = finished ? "done" : current ? "current" : "todo";

        return (
          <li
            className={`sd-lesson${expanded ? " is-open" : ""}${current ? " is-current" : ""}`}
            key={module.id}
          >
            <div className="sd-lesson__row">
              <button
                type="button"
                className="sd-lesson__select"
                onClick={() => onSelectLesson(module)}
                aria-current={current ? "true" : undefined}
              >
                {/* The number sits inside a ring that fills as the lesson is
                    read — see student.css. `--read` is the only thing the
                    markup has to hand it. */}
                <span
                  className="sd-lesson__marker"
                  data-state={state}
                  style={{ "--read": read }}
                  aria-hidden="true"
                >
                  {finished ? <CheckIcon size={13} /> : String(index + 1).padStart(2, "0")}
                </span>

                <span className="sd-lesson__text">
                  <span className="sd-lesson__title">{module.title}</span>
                  {/* The marker already says whether it is finished, so the
                      word underneath leads with "you are here" when both
                      are true rather than dropping one of the two facts. The
                      figure beside it answers the other question — not whether
                      you are here, but how much of it is behind you.

                      "Completed" waits for both halves. A lesson read to the
                      end with its quiz still to pass is under way, not done,
                      and saying otherwise beside a half-filled ring was the
                      row contradicting itself. */}
                  <span className="sd-lesson__meta">
                    <span className="sd-lesson__state">
                      {current
                        ? "Reading now"
                        : finished
                          ? "Completed"
                          : read > 0
                            ? "In progress"
                            : "Not started"}
                    </span>
                    <span className="sd-lesson__pct">{read}%</span>
                  </span>
                </span>
              </button>

              <button
                type="button"
                className="sd-lesson__toggle"
                onClick={() => onToggleSections(module)}
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-label={`${expanded ? "Hide" : "Show"} contents of ${module.title}`}
              >
                <span className="sd-lesson__chev">
                  <ChevronDownIcon size={15} />
                </span>
              </button>
            </div>

            {expanded ? (
              <div className="sd-lesson__panel" id={panelId}>
                {loading ? (
                  <ul className="sd-sections" aria-hidden="true">
                    {Array.from({ length: 3 }).map((_, row) => (
                      <li className="sd-sections__item" key={row} data-state="todo">
                        <span className="sd-sections__skeleton sd-skeleton" />
                      </li>
                    ))}
                  </ul>
                ) : !sections || sections.length === 0 ? (
                  <p className="sd-lesson__note">No sections detected in this module.</p>
                ) : (
                  <ul className="sd-sections">
                    {sections.map((section) => {
                      const here =
                        activeSection?.moduleId === module.id &&
                        activeSection?.sectionId === section.id;
                      const readHere = sectionProgressFor?.(module.id, section.id) ?? 0;

                      // Three states rather than two, because a part-read
                      // section is the one the student is looking for when
                      // they open this list, and a node that is only ever
                      // hollow or filled cannot point at it.
                      const mark = readHere >= 100 ? "done" : readHere > 0 ? "part" : "todo";

                      return (
                        <li
                          className={`sd-sections__item${here ? " is-here" : ""}`}
                          key={section.id}
                          data-state={mark}
                        >
                          <button
                            type="button"
                            className="sd-sections__btn"
                            onClick={() => onOpenSection(module, section)}
                            aria-current={here ? "true" : undefined}
                          >
                            <span
                              className="sd-sections__node"
                              style={{ "--read": readHere }}
                              aria-hidden="true"
                            >
                              {mark === "done" ? <CheckIcon size={9} /> : null}
                            </span>

                            <span className="sd-sections__body">
                              <span className="sd-sections__head">
                                <span className="sd-sections__title">{section.title}</span>
                                <span className="sd-sections__pct">{readHere}%</span>
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            {/* Outside the panel, so a lesson's quiz is visible without
                expanding it — the rail is meant to show the shape of the
                whole course at a glance, and a quiz nobody can see is a quiz
                nobody knows to work towards. */}
            {quizzes.length ? (
              <div className="sd-lesson__quizzes">
                {quizzes.map((quiz, quizIndex) => {
                  // A module's quiz opens once that module is finished.
                  // The server decides and sends `locked` with a reason;
                  // `done` is only the fallback if that field is absent,
                  // since the rail must never be the thing enforcing it.
                  const locked = quiz.locked ?? !readToEnd;
                  const open = String(selectedAssessmentId) === String(quiz.id);
                  const passed = quiz.result?.passed;

                  // Numbered off the lesson, not off a running count, so
                  // "Quiz 3" always belongs to lesson 03 however the quizzes
                  // themselves were generated. The suffix only appears in the
                  // case a lesson carries more than one.
                  const number =
                    quizzes.length > 1
                      ? `${index + 1}.${quizIndex + 1}`
                      : String(index + 1);

                  return (
                    /* A locked quiz opens; it just has nothing to sit. The row
                       used to be disabled, which left a student pressing a
                       dead button with no way to find out why beyond a
                       tooltip. It keeps its lock and its dashed border — it is
                       still shut — and says who opens it, in the viewer,
                       where there is room to say it. */
                    <button
                      key={quiz.id}
                      type="button"
                      className={`sd-lesson__quiz${open ? " is-open-item" : ""}${
                        locked ? " is-locked" : ""
                      }`}
                      onClick={() => onOpenAssessment(quiz)}
                      aria-current={open ? "true" : undefined}
                      title={quiz.title || undefined}
                    >
                      <span className="sd-lesson__quiz-icon">
                        {locked ? (
                          <LockIcon size={14} />
                        ) : passed ? (
                          <CheckIcon size={14} />
                        ) : (
                          <QuizIcon size={15} />
                        )}
                      </span>
                      {/* Why it is shut is not said here. The row can be
                          opened now, and the viewer gives the reason the room
                          to be read in — saying it twice, once in a line
                          narrow enough to wrap awkwardly, was the worse of the
                          two places to say it. */}
                      <span className="sd-lesson__quiz-text">
                        <span className="sd-lesson__quiz-title">Quiz {number}</span>
                      </span>
                      {locked ? (
                        <span className="sd-lesson__quiz-tag">Locked</span>
                      ) : quiz.result ? (
                        <span className="sd-lesson__quiz-tag">
                          {quiz.result.score}/{quiz.result.total}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default LessonNav;
