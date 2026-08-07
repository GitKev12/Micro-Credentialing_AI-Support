import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getStoredSession } from "../../auth/services/authService";
import {
  fetchCourseModules,
  fetchCourseProgress,
  fetchModuleSections,
  fetchModuleText,
  moduleFigureUrl,
  moduleFileUrl,
  setModuleCompleted
} from "../../services/learningModules";
// Student-scoped rather than the course-wide list in learningModules: a quiz's
// lock state and result only exist relative to who is asking.
import { fetchCourseAssessments } from "../../services/assessments";
import LessonNav from "./components/LessonNav";
import QuizRunner from "./components/QuizRunner";
import { LockIcon, QuizIcon } from "./components/icons";

// Breathing room left above a section heading when jumping to it.
const SECTION_SCROLL_MARGIN = 12;

// The extractor wraps runs that are italic in the source PDF with these
// control markers; render them as <em>.
const ITALIC_OPEN = String.fromCharCode(17); // U+0011
const ITALIC_CLOSE = String.fromCharCode(18); // U+0012

function renderStyledText(text) {
  if (!text || !text.includes(ITALIC_OPEN)) return text;

  const chunks = String(text).split(ITALIC_OPEN);
  const output = [chunks[0]];

  chunks.slice(1).forEach((chunk, index) => {
    const [italic, ...rest] = chunk.split(ITALIC_CLOSE);
    output.push(<em key={index}>{italic}</em>);
    output.push(rest.join(ITALIC_CLOSE));
  });

  return output;
}

// Renders the server's formatted lesson blocks (headings, paragraphs, lists,
// code samples, term definitions, and multiple-choice exercises).
function LessonBlocks({ blocks, answers, onAnswer, moduleId }) {
  return blocks.map((block, index) => {
    if (block.type === "figure") {
      return (
        <figure key={index} className="lesson-reader__figure">
          <img
            src={moduleFigureUrl(moduleId, block.fileId)}
            alt={`Figure from page ${block.page}`}
            loading="lazy"
            width={block.width}
            height={block.height}
          />
        </figure>
      );
    }

    if (block.type === "exercise") {
      const answeredCount = block.questions.filter(
        (question) => answers?.[question.id] !== undefined
      ).length;
      const allAnswered = answeredCount === block.questions.length;

      return (
        <div key={index} className="lesson-exercise">
          <p className="lesson-exercise__heading">Exercise</p>
          <ol className="lesson-exercise__questions">
            {block.questions.map((question) => (
              <li key={question.id} className="lesson-exercise__question">
                <p className="lesson-exercise__prompt">
                  {renderStyledText(question.prompt)}
                </p>
                <div className="lesson-exercise__choices">
                  {question.choices.map((choice, choiceIndex) => {
                    const checked = answers?.[question.id] === choiceIndex;
                    return (
                      <label
                        key={choiceIndex}
                        className={`lesson-exercise__choice${
                          checked ? " is-selected" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name={`exercise-${question.id}`}
                          checked={checked}
                          onChange={() => onAnswer?.(question.id, choiceIndex)}
                        />
                        <span>{renderStyledText(choice)}</span>
                      </label>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
          <p
            className={`lesson-exercise__status${allAnswered ? " is-done" : ""}`}
          >
            {allAnswered
              ? "All questions answered."
              : `${answeredCount} of ${block.questions.length} answered — answer every question to complete this lesson.`}
          </p>
        </div>
      );
    }

    if (block.type === "heading") {
      return block.level === 2 ? (
        <h2 key={index} className="lesson-reader__h2">
          {block.text}
        </h2>
      ) : (
        <h3 key={index} className="lesson-reader__h3">
          {block.text}
        </h3>
      );
    }

    if (block.type === "list") {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag key={index} className="lesson-reader__list">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderStyledText(item)}</li>
          ))}
        </ListTag>
      );
    }

    if (block.type === "code") {
      return (
        <pre key={index} className="lesson-reader__code">
          <code>{block.text}</code>
        </pre>
      );
    }

    if (block.type === "term") {
      return (
        <p key={index} className="lesson-reader__term">
          <strong className="lesson-reader__term-name">{block.term}</strong>
          <span className="lesson-reader__term-sep" aria-hidden="true">
            {" — "}
          </span>
          {renderStyledText(block.text)}
        </p>
      );
    }

    return (
      <p key={index} className="lesson-reader__p">
        {renderStyledText(block.text)}
      </p>
    );
  });
}

function LearningModules() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const studentId = getStoredSession()?.user?.id;

  const [modules, setModules] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [completedIds, setCompletedIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // The item shown in the right-hand viewer: { type: "lesson" | "assessment", item }.
  const [selected, setSelected] = useState(null);
  const [textByModule, setTextByModule] = useState({});
  const [textStatus, setTextStatus] = useState("idle");
  const [textRetry, setTextRetry] = useState(0);
  const [completionBusy, setCompletionBusy] = useState(false);
  // Selected exercise answers, per module: { [moduleId]: { [questionId]: choiceIndex } }.
  const [answersByModule, setAnswersByModule] = useState({});
  // Modules whose reader was scrolled to the end this session.
  const [endReachedIds, setEndReachedIds] = useState([]);
  // Section dropdown state: which chapter is expanded + fetched section lists.
  const [expandedId, setExpandedId] = useState(null);
  const [sectionsByModule, setSectionsByModule] = useState({});
  const [sectionsLoadingId, setSectionsLoadingId] = useState(null);
  // Section to scroll to once the lesson text is on screen.
  const [pendingSection, setPendingSection] = useState(null);
  // Section the rail keeps lit. Unlike pendingSection this survives the
  // scroll, so the list still shows where in the lesson you landed.
  const [activeSection, setActiveSection] = useState(null);
  // The scrollable reader pane — watched to auto-complete lessons.
  const readerRef = useRef(null);

  // Course title travels via navigation state; fall back to the modules'
  // subject code after a hard refresh.
  const courseTitle = location.state?.title ?? modules[0]?.subject ?? "Course";

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setSelected(null);

    Promise.all([
      fetchCourseModules(courseId).catch(() => []),
      fetchCourseAssessments(studentId, courseId).catch(() => []),
      fetchCourseProgress(studentId, courseId).catch(() => [])
    ])
      .then(([moduleList, assessmentList, completedList]) => {
        if (!active) return;
        setModules(moduleList);
        setAssessments(assessmentList);
        setCompletedIds(completedList.map(String));
        // Open the first lesson by default so the viewer isn't empty.
        if (moduleList.length > 0) {
          setSelected({ type: "lesson", item: moduleList[0] });
        } else if (assessmentList.length > 0) {
          setSelected({ type: "assessment", item: assessmentList[0] });
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [courseId, studentId]);

  const selectedLessonId = selected?.type === "lesson" ? selected.item.id : null;
  const selectedAssessmentId =
    selected?.type === "assessment" ? selected.item.id : null;
  const lessonText = selectedLessonId ? textByModule[selectedLessonId] : null;

  // Fetch the extracted text once per module (the server caches too, so
  // repeat visits are instant).
  useEffect(() => {
    if (!selectedLessonId || textByModule[selectedLessonId]) {
      return undefined;
    }

    let active = true;
    setTextStatus("loading");

    fetchModuleText(selectedLessonId)
      .then((data) => {
        if (!active) return;
        setTextByModule((cache) => ({ ...cache, [selectedLessonId]: data }));
        setTextStatus("idle");
      })
      .catch(() => {
        if (active) setTextStatus("error");
      });

    return () => {
      active = false;
    };
  }, [selectedLessonId, textByModule, textRetry]);

  // Once the target lesson's text is rendered, jump to the chosen section.
  useEffect(() => {
    if (!pendingSection || pendingSection.moduleId !== selectedLessonId) return;
    if (!lessonText) return;

    const reader = readerRef.current;
    const target = document.getElementById(
      `lesson-section-${pendingSection.sectionId}`
    );

    // scrollIntoView() scrolls *every* scrollable ancestor, so it moved the
    // reader pane and dragged the page behind it along too. Scrolling the
    // pane directly leaves the rest of the page where the student left it.
    if (reader && target) {
      const offset =
        target.getBoundingClientRect().top - reader.getBoundingClientRect().top;
      reader.scrollTo({
        top: reader.scrollTop + offset - SECTION_SCROLL_MARGIN,
        behavior: "smooth"
      });
    }

    setPendingSection(null);
  }, [pendingSection, lessonText, selectedLessonId]);

  const isCompleted = (moduleId) => completedIds.includes(String(moduleId));

  // Multiple-choice questions the server extracted from the module's own
  // evaluation section — empty when the PDF has none.
  const exerciseQuestionsFor = (moduleId) => {
    const blocks = textByModule[moduleId]?.blocks ?? [];
    return blocks
      .filter((block) => block.type === "exercise")
      .flatMap((block) => block.questions);
  };

  // A module with an exercise only completes once every question is answered.
  const isExerciseFulfilled = (moduleId) => {
    const answers = answersByModule[moduleId] ?? {};
    return exerciseQuestionsFor(moduleId).every(
      (question) => answers[question.id] !== undefined
    );
  };

  const selectAnswer = (moduleId, questionId, choiceIndex) => {
    setAnswersByModule((all) => ({
      ...all,
      [moduleId]: { ...(all[moduleId] ?? {}), [questionId]: choiceIndex }
    }));
  };

  const noteEndReached = (moduleId) => {
    setEndReachedIds((ids) =>
      ids.includes(String(moduleId)) ? ids : [...ids, String(moduleId)]
    );
  };

  // Lesson quizzes are stored one per module, so the rail groups them by their
  // module and shows each inside that module's dropdown. The course's single
  // final assessment belongs to no lesson and sits at the foot of the rail.
  const assessmentsByModule = assessments.reduce((groups, assessment) => {
    if (assessment.scope === "final") return groups;
    const key = String(assessment.moduleId ?? "");
    if (!key) return groups;
    (groups[key] ??= []).push(assessment);
    return groups;
  }, {});

  const finalAssessment = assessments.find((assessment) => assessment.scope === "final") ?? null;

  const completedCount = modules.filter((module) => isCompleted(module.id)).length;
  const progressPercent = modules.length
    ? Math.round((completedCount / modules.length) * 100)
    : 0;

  const selectedIndex = selectedLessonId
    ? modules.findIndex((module) => module.id === selectedLessonId)
    : -1;

  const openLessonAt = (index) => {
    const module = modules[index];
    if (module) setSelected({ type: "lesson", item: module });
  };

  const toggleSections = (module) => {
    const moduleId = module.id;
    setExpandedId((current) => (current === moduleId ? null : moduleId));

    if (!sectionsByModule[moduleId]) {
      setSectionsLoadingId(moduleId);
      fetchModuleSections(moduleId)
        .then((sections) =>
          setSectionsByModule((cache) => ({ ...cache, [moduleId]: sections }))
        )
        .catch(() =>
          setSectionsByModule((cache) => ({ ...cache, [moduleId]: [] }))
        )
        .finally(() =>
          setSectionsLoadingId((current) => (current === moduleId ? null : current))
        );
    }
  };

  const openSection = (module, section) => {
    setSelected({ type: "lesson", item: module });
    setPendingSection({ moduleId: module.id, sectionId: section.id });
    setActiveSection({ moduleId: module.id, sectionId: section.id });
  };

  // Opening a lesson from its row lands at the top, so no section is current.
  const openLesson = (module) => {
    setSelected({ type: "lesson", item: module });
    setActiveSection(null);
  };

  const openAssessment = (assessment) => {
    setSelected({ type: "assessment", item: assessment });
    setActiveSection(null);
  };

  /**
   * A submitted quiz can unlock the final, so the rail's lock states are
   * re-read rather than patched locally — the gate is the server's call.
   */
  const refreshAssessments = () => {
    fetchCourseAssessments(studentId, courseId)
      .then(setAssessments)
      .catch(() => {});
  };

  // Reading to the end of a lesson (and finishing its exercise, when the
  // module has one) marks it complete automatically.
  const markLessonComplete = async (moduleId) => {
    if (!studentId || !moduleId || completionBusy || isCompleted(moduleId)) return;
    if (!isExerciseFulfilled(moduleId)) return;

    setCompletionBusy(true);
    try {
      await setModuleCompleted(studentId, moduleId, true);
      setCompletedIds((ids) =>
        ids.includes(String(moduleId)) ? ids : [...ids, String(moduleId)]
      );
    } catch (_error) {
      // Ignore — the next scroll event retries.
    } finally {
      setCompletionBusy(false);
    }
  };

  const handleReaderScroll = (event) => {
    // Loading/error placeholders are short — scrolling them must not count.
    if (!lessonText) return;
    const reader = event.currentTarget;
    if (reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 32) {
      noteEndReached(selectedLessonId);
    }
  };

  // Completion needs both signals: the reader scrolled to the end AND the
  // module's exercise (if any) fully answered — in either order.
  useEffect(() => {
    if (!selectedLessonId || !lessonText) return;
    if (!endReachedIds.includes(String(selectedLessonId))) return;
    if (!isExerciseFulfilled(selectedLessonId)) return;
    markLessonComplete(selectedLessonId);
  }, [endReachedIds, answersByModule, selectedLessonId, lessonText]);

  // Each lesson starts at the top of the pane. Without this, the previous
  // module's scroll position survives the content swap and the bottom-of-pane
  // check instantly completes a module the student never read.
  useLayoutEffect(() => {
    const reader = readerRef.current;
    if (reader) reader.scrollTop = 0;
  }, [selectedLessonId]);

  // Lessons short enough to show without scrolling count as read on open.
  useEffect(() => {
    if (!lessonText || !selectedLessonId) return;
    const reader = readerRef.current;
    if (reader && reader.scrollHeight <= reader.clientHeight + 8) {
      noteEndReached(selectedLessonId);
    }
  }, [lessonText, selectedLessonId]);

  return (
    <section className="student-courses modules-page">
      <div className="modules-page__header">
        <button
          type="button"
          className="dash-back"
          onClick={() => navigate("/student")}
        >
          <span aria-hidden="true">←</span> Back to courses
        </button>

        <h2 className="student-courses__title modules-page__title">
          {courseTitle} · Learning Modules
        </h2>
      </div>

      <div className="modules-layout">
        {/* Left: curriculum — numbered lessons with completion state */}
        <aside className="modules-layout__aside">
          {!isLoading && modules.length > 0 ? (
            <div className="modules-progress">
              <div className="modules-progress__row">
                <span className="modules-progress__label">Course progress</span>
                <span className="modules-progress__count">
                  {completedCount} / {modules.length}
                </span>
              </div>
              <div
                className="modules-progress__bar"
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Lessons completed"
              >
                <div
                  className="modules-progress__fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : null}

          <h3 className="modules-section__title">Lessons</h3>

          {/* Only the list scrolls — the progress block and heading stay put. */}
          <div className="modules-layout__scroll">
            {isLoading ? (
              <p className="student-courses__status">Loading lessons…</p>
            ) : modules.length === 0 ? (
              <p className="student-courses__status">
                No lessons have been uploaded for this course yet.
              </p>
            ) : (
              <LessonNav
                modules={modules}
                isCompleted={isCompleted}
                selectedLessonId={selectedLessonId}
                selectedAssessmentId={selectedAssessmentId}
                activeSection={activeSection}
                expandedId={expandedId}
                sectionsByModule={sectionsByModule}
                sectionsLoadingId={sectionsLoadingId}
                assessmentsByModule={assessmentsByModule}
                onSelectLesson={openLesson}
                onToggleSections={toggleSections}
                onOpenSection={openSection}
                onOpenAssessment={openAssessment}
              />
            )}

            {/* One per course, below every lesson: the last thing in the rail
                because it is the last thing you sit. It stays shut until all
                lessons are read and all lesson quizzes passed — the server
                decides that and sends the reason with it. */}
            {finalAssessment ? (
              <div className="sd-final">
                <p className="sd-final__label">Final assessment</p>

                <button
                  type="button"
                  className={`sd-final__btn${
                    String(selectedAssessmentId) === String(finalAssessment.id)
                      ? " is-open-item"
                      : ""
                  }`}
                  disabled={finalAssessment.locked}
                  onClick={() => openAssessment(finalAssessment)}
                  aria-current={
                    String(selectedAssessmentId) === String(finalAssessment.id)
                      ? "true"
                      : undefined
                  }
                  title={finalAssessment.locked ? finalAssessment.reason : undefined}
                >
                  <span className="sd-final__icon">
                    {finalAssessment.locked ? <LockIcon size={15} /> : <QuizIcon size={16} />}
                  </span>

                  <span className="sd-final__text">
                    <span className="sd-final__title">{finalAssessment.title}</span>
                    <span className="sd-final__state">
                      {finalAssessment.result
                        ? `Scored ${finalAssessment.result.score} of ${finalAssessment.result.total}`
                        : finalAssessment.locked
                          ? finalAssessment.reason
                          : `${finalAssessment.itemCount} questions · pass ${finalAssessment.passMark}`}
                    </span>
                  </span>

                  {finalAssessment.locked ? (
                    <span className="sd-final__tag">Locked</span>
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        {/* Right: the selected module, shown wider */}
        <div className="modules-layout__main">
          {!selected ? (
            <div className="module-viewer module-viewer--empty">
              <p className="student-courses__status">
                Select a lesson or assessment on the left to open it here.
              </p>
            </div>
          ) : selected.type === "lesson" ? (
            <div className="module-viewer">
              <div className="module-viewer__head">
                <h3 className="module-viewer__title">{selected.item.title}</h3>
                <div className="module-viewer__tools">
                  {isCompleted(selected.item.id) ? (
                    <span className="module-row__action module-viewer__complete is-done">
                      ✓ Completed
                    </span>
                  ) : null}
                  <a
                    className="module-row__action"
                    href={moduleFileUrl(selected.item.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in new tab
                  </a>
                </div>
              </div>

              <div
                ref={readerRef}
                className="module-viewer__text lesson-reader"
                aria-label={`${selected.item.title} lesson content`}
                onScroll={handleReaderScroll}
              >
                {!lessonText && textStatus === "loading" ? (
                  <p className="student-courses__status">Extracting text…</p>
                ) : !lessonText && textStatus === "error" ? (
                  <div className="module-viewer__text-status">
                    <p className="student-courses__status">
                      Couldn&apos;t extract this module&apos;s text.
                    </p>
                    <button
                      type="button"
                      className="module-row__action"
                      onClick={() => setTextRetry((count) => count + 1)}
                    >
                      Try again
                    </button>
                  </div>
                ) : lessonText && !lessonText.hasText ? (
                  <p className="student-courses__status">
                    This module looks like a scanned document — it has no
                    embedded text to extract.
                  </p>
                ) : lessonText ? (
                  <div className="lesson-reader__content">
                    {lessonText.blocks?.length ? (
                      lessonText.sections?.length ? (
                        lessonText.sections.map((section) => (
                          <section
                            key={section.id}
                            id={`lesson-section-${section.id}`}
                            className="lesson-reader__section"
                          >
                            <LessonBlocks
                              blocks={lessonText.blocks.slice(
                                section.start,
                                section.end
                              )}
                              moduleId={selectedLessonId}
                              answers={answersByModule[selectedLessonId]}
                              onAnswer={(questionId, choiceIndex) =>
                                selectAnswer(selectedLessonId, questionId, choiceIndex)
                              }
                            />
                          </section>
                        ))
                      ) : (
                        <LessonBlocks
                          blocks={lessonText.blocks}
                          moduleId={selectedLessonId}
                          answers={answersByModule[selectedLessonId]}
                          onAnswer={(questionId, choiceIndex) =>
                            selectAnswer(selectedLessonId, questionId, choiceIndex)
                          }
                        />
                      )
                    ) : (
                      lessonText.pages.map((page) => (
                        <pre key={page.page} className="module-viewer__page-text">
                          {page.text}
                        </pre>
                      ))
                    )}
                  </div>
                ) : null}
              </div>

              <div className="module-viewer__nav">
                <button
                  type="button"
                  className="module-row__action"
                  onClick={() => openLessonAt(selectedIndex - 1)}
                  disabled={selectedIndex <= 0}
                >
                  ← Previous lesson
                </button>
                <span className="module-viewer__nav-pos">
                  Lesson {selectedIndex + 1} of {modules.length}
                </span>
                <button
                  type="button"
                  className="module-row__action"
                  onClick={() => openLessonAt(selectedIndex + 1)}
                  disabled={selectedIndex >= modules.length - 1}
                >
                  Next lesson →
                </button>
              </div>
            </div>
          ) : (
            <div className="module-viewer">
              <div className="module-viewer__head">
                <h3 className="module-viewer__title">{selected.item.title}</h3>
                {selected.item.scope === "final" ? (
                  <span className="module-row__action module-viewer__complete">
                    Final assessment
                  </span>
                ) : null}
              </div>

              <QuizRunner
                studentId={studentId}
                assessment={selected.item}
                onSubmitted={refreshAssessments}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default LearningModules;
