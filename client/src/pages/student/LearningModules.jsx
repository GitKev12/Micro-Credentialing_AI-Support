import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  fetchCourseAssessments,
  fetchCourseModules,
  moduleFileUrl
} from "../../services/learningModules";

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LearningModules() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [modules, setModules] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Course title travels via navigation state; fall back to the modules'
  // subject code after a hard refresh.
  const courseTitle = location.state?.title ?? modules[0]?.subject ?? "Course";

  useEffect(() => {
    let active = true;

    Promise.all([
      fetchCourseModules(courseId).catch(() => []),
      fetchCourseAssessments(courseId).catch(() => [])
    ])
      .then(([moduleList, assessmentList]) => {
        if (!active) return;
        setModules(moduleList);
        setAssessments(assessmentList);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [courseId]);

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

      <h3 className="modules-section__title">Lessons</h3>
      {isLoading ? (
        <p className="student-courses__status">Loading lessons…</p>
      ) : modules.length === 0 ? (
        <p className="student-courses__status">
          No lessons have been uploaded for this course yet.
        </p>
      ) : (
        <ul className="module-list">
          {modules.map((module) => {
            const size = formatFileSize(module.fileSize);

            return (
              <li key={module.id} className="module-row">
                <span className="module-row__icon" aria-hidden="true">
                  📄
                </span>
                <span className="module-row__info">
                  <span className="module-row__title">{module.title}</span>
                  <span className="module-row__meta">
                    {module.fileName}
                    {size ? ` · ${size}` : ""}
                  </span>
                </span>
                <a
                  className="module-row__action"
                  href={moduleFileUrl(module.id)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Read ${module.title}`}
                >
                  Read
                </a>
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
          No assessments for this course yet. They&apos;ll appear here once your
          assessor posts them.
        </p>
      ) : (
        <ul className="module-list">
          {assessments.map((assessment) => (
            <li key={assessment.id} className="module-row">
              <span className="module-row__icon" aria-hidden="true">
                📝
              </span>
              <span className="module-row__info">
                <span className="module-row__title">{assessment.title}</span>
                {assessment.description ? (
                  <span className="module-row__meta">{assessment.description}</span>
                ) : null}
              </span>
              {/* Assessment-taking flow isn't built yet — placeholder action. */}
              <button type="button" className="module-row__action" disabled>
                Take
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default LearningModules;
