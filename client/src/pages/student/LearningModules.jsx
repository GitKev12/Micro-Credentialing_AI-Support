import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getStoredSession } from "../../auth/services/authService";
import {
  fetchCourseAssessments,
  fetchCourseModules,
  fetchCourseProgress,
  fetchModuleText,
  moduleFileUrl,
  setModuleCompleted
} from "../../services/learningModules";

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Renders the server's formatted lesson blocks (headings/paragraphs/lists).
function LessonBlocks({ blocks }) {
  return blocks.map((block, index) => {
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
            <li key={itemIndex}>{item}</li>
          ))}
        </ListTag>
      );
    }

    return (
      <p key={index} className="lesson-reader__p">
        {block.text}
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
  // Lesson viewer mode: the PDF itself, or its OCR-extracted text.
  const [viewMode, setViewMode] = useState("pdf");
  const [textByModule, setTextByModule] = useState({});
  const [textStatus, setTextStatus] = useState("idle");
  const [textRetry, setTextRetry] = useState(0);
  const [completionBusy, setCompletionBusy] = useState(false);

  // Course title travels via navigation state; fall back to the modules'
  // subject code after a hard refresh.
  const courseTitle = location.state?.title ?? modules[0]?.subject ?? "Course";

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setSelected(null);

    Promise.all([
      fetchCourseModules(courseId).catch(() => []),
      fetchCourseAssessments(courseId).catch(() => []),
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
  const lessonText = selectedLessonId ? textByModule[selectedLessonId] : null;

  // Fetch the extracted text lazily: only in text mode, only once per module
  // (the server caches too, so repeat visits are instant).
  useEffect(() => {
    if (viewMode !== "text" || !selectedLessonId || textByModule[selectedLessonId]) {
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
  }, [viewMode, selectedLessonId, textByModule, textRetry]);

  const isActive = (type, id) => selected?.type === type && selected.item.id === id;
  const isCompleted = (moduleId) => completedIds.includes(String(moduleId));

  const completedCount = modules.filter((module) => isCompleted(module.id)).length;
  const progressPercent = modules.length
    ? Math.round((completedCount / modules.length) * 100)
    : 0;
  const allLessonsDone = modules.length > 0 && completedCount === modules.length;

  const selectedIndex = selectedLessonId
    ? modules.findIndex((module) => module.id === selectedLessonId)
    : -1;

  const openLessonAt = (index) => {
    const module = modules[index];
    if (module) setSelected({ type: "lesson", item: module });
  };

  const toggleCompleted = async () => {
    if (!studentId || !selectedLessonId || completionBusy) return;
    const nextState = !isCompleted(selectedLessonId);

    setCompletionBusy(true);
    try {
      await setModuleCompleted(studentId, selectedLessonId, nextState);
      setCompletedIds((ids) =>
        nextState
          ? [...ids, String(selectedLessonId)]
          : ids.filter((id) => id !== String(selectedLessonId))
      );
    } catch (_error) {
      // Leave the local state unchanged; the button stays togglable.
    } finally {
      setCompletionBusy(false);
    }
  };

  return (
    <section className="student-courses modules-page">
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
          {isLoading ? (
            <p className="student-courses__status">Loading lessons…</p>
          ) : modules.length === 0 ? (
            <p className="student-courses__status">
              No lessons have been uploaded for this course yet.
            </p>
          ) : (
            <ul className="module-list">
              {modules.map((module, index) => {
                const size = formatFileSize(module.fileSize);
                const done = isCompleted(module.id);

                return (
                  <li key={module.id}>
                    <button
                      type="button"
                      className={`module-row module-row--button${
                        isActive("lesson", module.id) ? " is-active" : ""
                      }${done ? " is-complete" : ""}`}
                      onClick={() => setSelected({ type: "lesson", item: module })}
                      aria-label={`${module.title}${done ? " (completed)" : ""}`}
                    >
                      <span
                        className={`module-row__num${done ? " is-done" : ""}`}
                        aria-hidden="true"
                      >
                        {done ? "✓" : String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="module-row__info">
                        <span className="module-row__title">{module.title}</span>
                        <span className="module-row__meta">
                          {module.fileName}
                          {size ? ` · ${size}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="modules-section__title">Assessments</h3>
          {isLoading ? (
            <p className="student-courses__status">Loading assessments…</p>
          ) : assessments.length === 0 ? (
            <p className="student-courses__status">
              No assessments for this course yet.
            </p>
          ) : (
            <>
              {!allLessonsDone ? (
                <p className="modules-lock-note">
                  <span aria-hidden="true">🔒</span> Complete all lessons to
                  unlock assessments.
                </p>
              ) : null}
              <ul className="module-list">
                {assessments.map((assessment) => (
                  <li key={assessment.id}>
                    <button
                      type="button"
                      className={`module-row module-row--button${
                        isActive("assessment", assessment.id) ? " is-active" : ""
                      }`}
                      disabled={!allLessonsDone}
                      onClick={() =>
                        setSelected({ type: "assessment", item: assessment })
                      }
                    >
                      <span className="module-row__icon" aria-hidden="true">
                        {allLessonsDone ? "📝" : "🔒"}
                      </span>
                      <span className="module-row__info">
                        <span className="module-row__title">{assessment.title}</span>
                        {assessment.description ? (
                          <span className="module-row__meta">
                            {assessment.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
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
                  <div
                    className="dash-tabs module-viewer__modes"
                    role="tablist"
                    aria-label="Lesson view mode"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={viewMode === "pdf"}
                      className={`dash-tab${viewMode === "pdf" ? " is-active" : ""}`}
                      onClick={() => setViewMode("pdf")}
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={viewMode === "text"}
                      className={`dash-tab${viewMode === "text" ? " is-active" : ""}`}
                      onClick={() => setViewMode("text")}
                    >
                      Text (OCR)
                    </button>
                  </div>
                  <button
                    type="button"
                    className={`module-row__action module-viewer__complete${
                      isCompleted(selected.item.id) ? " is-done" : ""
                    }`}
                    onClick={toggleCompleted}
                    disabled={completionBusy}
                  >
                    {isCompleted(selected.item.id) ? "✓ Completed" : "Mark as complete"}
                  </button>
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

              {viewMode === "pdf" ? (
                <iframe
                  className="module-viewer__frame"
                  src={moduleFileUrl(selected.item.id)}
                  title={selected.item.title}
                />
              ) : (
                <div
                  className="module-viewer__text lesson-reader"
                  aria-label={`${selected.item.title} extracted text`}
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
                      <p className="lesson-reader__meta">
                        {lessonText.readingMinutes
                          ? `~${lessonText.readingMinutes} min read · `
                          : ""}
                        {lessonText.numPages} pages
                      </p>
                      {lessonText.blocks?.length ? (
                        <LessonBlocks blocks={lessonText.blocks} />
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
              )}

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
                {/* Assessment-taking flow isn't built yet — placeholder action. */}
                <button type="button" className="module-row__action" disabled>
                  Take
                </button>
              </div>
              {selected.item.description ? (
                <p className="module-viewer__desc">{selected.item.description}</p>
              ) : null}
              <p className="student-courses__status">
                The assessment-taking flow isn&apos;t available yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default LearningModules;
