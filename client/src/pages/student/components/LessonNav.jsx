import { CheckIcon, ChevronDownIcon, LockIcon, QuizIcon } from "./icons";

/**
 * The lesson list in the learning-modules rail.
 *
 * Each module is a disclosure group: the row, then a panel holding that
 * module's sections and its assessment. The assessment used to live in a
 * separate full-width block under the reader, which put a module's quiz a
 * whole page away from the lesson it belongs to — the Assessment collection
 * stores one generated quiz per module, so it belongs with its module.
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

                {quizzes.length ? (
                  <div className="sd-lesson__quizzes">
                    <p className="sd-lesson__group-label">
                      {quizzes.length === 1 ? "Assessment" : "Assessments"}
                    </p>

                    {quizzes.map((quiz) => {
                      // A module's quiz opens once that module is finished —
                      // the per-module counterpart of the old rule, which kept
                      // every quiz locked until the whole course was done.
                      const locked = !done;
                      const open = String(selectedAssessmentId) === String(quiz.id);

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
                              ? `Finish ${module.title} to unlock this assessment`
                              : undefined
                          }
                        >
                          <span className="sd-lesson__quiz-icon">
                            {locked ? <LockIcon size={14} /> : <QuizIcon size={15} />}
                          </span>
                          <span className="sd-lesson__quiz-title">{quiz.title}</span>
                          {locked ? (
                            <span className="sd-lesson__quiz-tag">Locked</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default LessonNav;
