import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStoredSession } from "../../../auth/services/authService";
import { courseImageUrl, fetchStudentCourses } from "../../../services/courses";
import noCoursesImage from "../../../assets/no-courses-student.png";

// Placeholder backdrops for courses that have no stored picture.
const PLACEHOLDER_GRADIENTS = [
  "linear-gradient(135deg, #2563eb, #1e3a8a)",
  "linear-gradient(135deg, #0ea5e9, #0369a1)",
  "linear-gradient(135deg, #6366f1, #3730a3)",
  "linear-gradient(135deg, #14b8a6, #0f766e)"
];

/**
 * Where the student stands in a course, as the card says it.
 *
 * The server derives `status` from the lessons marked complete in the reader,
 * but the card recomputes it from the counts when an older response omits it,
 * so a missing field degrades to "not started" rather than to a blank chip.
 * Every state carries a word as well as a colour — the dot alone never
 * carries the meaning.
 */
const STATUSES = {
  completed: { id: "completed", label: "Completed" },
  "in-progress": { id: "in-progress", label: "In progress" },
  "not-started": { id: "not-started", label: "Not started" }
};

function statusOf(course) {
  if (STATUSES[course.status]) return STATUSES[course.status];

  const total = Number(course.moduleCount) || 0;
  const done = Number(course.completedModules) || 0;
  if (total > 0 && done >= total) return STATUSES.completed;
  return done > 0 ? STATUSES["in-progress"] : STATUSES["not-started"];
}

function lessonLine(course) {
  const total = Number(course.moduleCount) || 0;
  if (!total) return "No lessons yet";

  const done = Math.min(Number(course.completedModules) || 0, total);
  return `${done} of ${total} ${total === 1 ? "lesson" : "lessons"} done`;
}

// Recomputed from the counts rather than read from `progress`, so the bar and
// the "3 of 8" beside it can never disagree.
function percentOf(course) {
  const total = Number(course.moduleCount) || 0;
  if (!total) return 0;

  const done = Math.min(Number(course.completedModules) || 0, total);
  return Math.round((done / total) * 100);
}

function StudentCourses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const openCourse = (course) => {
    navigate(`/student/courses/${course.id}/modules`, {
      state: { title: course.title }
    });
  };

  useEffect(() => {
    let active = true;
    const studentId = getStoredSession()?.user?.id;

    fetchStudentCourses(studentId)
      .then((list) => {
        if (active) setCourses(list);
      })
      .catch(() => {
        if (active) setCourses([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // One line under the heading so the page answers "where am I overall?"
  // before the student reads a single card.
  const summary = useMemo(() => {
    if (!courses.length) return "";

    const done = courses.filter((course) => statusOf(course).id === "completed").length;
    const active = courses.filter((course) => statusOf(course).id === "in-progress").length;
    const parts = [`${courses.length} ${courses.length === 1 ? "course" : "courses"}`];

    if (active) parts.push(`${active} in progress`);
    if (done) parts.push(`${done} completed`);
    return parts.join(" · ");
  }, [courses]);

  return (
    <section className="student-courses">
      <h2 className="student-courses__title">Your Courses</h2>
      {!isLoading && summary ? <p className="student-courses__summary">{summary}</p> : null}

      {isLoading ? (
        <ul className="student-courses__list" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <li key={index} className="course-card course-card--skeleton" />
          ))}
        </ul>
      ) : courses.length === 0 ? (
        <div className="student-courses__empty">
          <img
            className="student-courses__empty-img"
            src={noCoursesImage}
            alt=""
            aria-hidden="true"
          />
          <p className="student-courses__empty-title">
            You aren&apos;t enrolled in any courses yet
          </p>
          <p className="student-courses__empty-text">
            Your courses will show up here once you&apos;re enrolled.
          </p>
        </div>
      ) : (
        <ul className="student-courses__list">
          {courses.map((course, index) => {
            const backdrop = course.hasImage
              ? `url(${courseImageUrl(course.id)})`
              : course.imageUrl
                ? `url(${course.imageUrl})`
                : PLACEHOLDER_GRADIENTS[index % PLACEHOLDER_GRADIENTS.length];

            const status = statusOf(course);
            const percent = percentOf(course);
            const lessons = lessonLine(course);

            return (
              <li
                key={course.id}
                className="course-card course-card--enter"
                data-status={status.id}
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div
                  className="course-card__image"
                  style={{ backgroundImage: backdrop }}
                  role="img"
                  aria-label={course.title}
                />
                <span className="course-card__status" aria-hidden="true">
                  <span className="course-card__status-dot" />
                  {status.label}
                </span>
                <div className="course-card__overlay">
                  <span className="course-card__name">{course.title}</span>
                  {course.code ? (
                    <span className="course-card__code">{course.code}</span>
                  ) : null}
                  {course.description ? (
                    <span className="course-card__desc">{course.description}</span>
                  ) : null}

                  <div className="course-card__progress" aria-hidden="true">
                    <span className="course-card__track">
                      <span className="course-card__fill" style={{ width: `${percent}%` }} />
                    </span>
                    <span className="course-card__progress-text">
                      <span>{lessons}</span>
                      {course.moduleCount ? <span>{percent}%</span> : null}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="course-card__click"
                  onClick={() => openCourse(course)}
                  aria-label={`Open ${course.title} learning modules — ${status.label}, ${lessons}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default StudentCourses;
