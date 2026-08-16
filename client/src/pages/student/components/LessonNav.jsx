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
  onSelectLesson,
  onToggleSections,
  onOpenSection,
  onOpenAssessment
}) {
  return (
    <ul className="sd-lesson-nav">
      {modules.map((module, index) => {
        const done = isCompleted(module.id);
        const current = String(selectedLessonId) === String(module.id);
        const expanded = expandedId === module.id;
        const sections = sectionsByModule[module.id];
        const loading = !sections && sectionsLoadingId === module.id;
        const quizzes = assessmentsByModule[module.id] ?? [];
        const panelId = `lesson-sections-${module.id}`;

        const state = done ? "done" : current ? "current" : "todo";

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
                <span className="sd-lesson__marker" data-state={state} aria-hidden="true">
                  {done ? <CheckIcon size={13} /> : String(index + 1).padStart(2, "0")}
                </span>

                <span className="sd-lesson__text">
                  <span className="sd-lesson__title">{module.title}</span>
                  {/* The marker already says whether it is finished, so the
                      word underneath leads with "you are here" when both
                      are true rather than dropping one of the two facts. */}
                  <span className="sd-lesson__state">
                    {current ? "Reading now" : done ? "Completed" : "Not started"}
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
                  <ul className="sd-lesson__sections" aria-hidden="true">
                    {Array.from({ length: 3 }).map((_, row) => (
                      <li className="sd-lesson__section" key={row}>
                        <span className="sd-lesson__section-skeleton sd-skeleton" />
                      </li>
                    ))}
                  </ul>
                ) : !sections || sections.length === 0 ? (
                  <p className="sd-lesson__note">No sections detected in this module.</p>
                ) : (
                  <ul className="sd-lesson__sections">
                    {sections.map((section) => {
                      const here =
                        activeSection?.moduleId === module.id &&
                        activeSection?.sectionId === section.id;

                      return (
                        <li
                          className={`sd-lesson__section${here ? " is-here" : ""}`}
                          key={section.id}
                        >
                          <button
                            type="button"
                            className="sd-lesson__section-btn"
                            onClick={() => onOpenSection(module, section)}
                            aria-current={here ? "true" : undefined}
                          >
                            {section.title}
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
                  const locked = quiz.locked ?? !done;
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
                    <button
                      key={quiz.id}
                      type="button"
                      className={`sd-lesson__quiz${open ? " is-open-item" : ""}`}
                      disabled={locked}
                      onClick={() => onOpenAssessment(quiz)}
                      aria-current={open ? "true" : undefined}
                      title={
                        locked
                          ? (quiz.reason ??
                            `Finish ${module.title} to unlock this assessment`)
                          : (quiz.title || undefined)
                      }
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
                      <span className="sd-lesson__quiz-title">Quiz {number}</span>
                      {/* A quiz waiting to be written is open, not locked —
                          "Locked" would tell a student who has finished reading
                          that they still have something to do first. */}
                      {quiz.needsGeneration ? (
                        <span className="sd-lesson__quiz-tag">Ready</span>
                      ) : locked ? (
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
