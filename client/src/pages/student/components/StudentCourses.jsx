import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStoredSession } from "../../../auth/services/authService";
import { fetchStudentCourses } from "../../../services/courses";
import noCoursesImage from "../../../assets/no-courses-student.png";

// Placeholder backdrops shown until real course pictures exist (course.imageUrl).
const PLACEHOLDER_GRADIENTS = [
  "linear-gradient(135deg, #2563eb, #1e3a8a)",
  "linear-gradient(135deg, #0ea5e9, #0369a1)",
  "linear-gradient(135deg, #6366f1, #3730a3)",
  "linear-gradient(135deg, #14b8a6, #0f766e)"
];

function StudentCourses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const openCourse = (course) => {
    navigate("/student/dashboard", {
      state: { courseId: course.id, title: course.title }
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

  return (
    <section className="student-courses">
      <h2 className="student-courses__title">Your Courses</h2>

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
            const backdrop = course.imageUrl
              ? `url(${course.imageUrl})`
              : PLACEHOLDER_GRADIENTS[index % PLACEHOLDER_GRADIENTS.length];

            return (
              <li
                key={course.id}
                className="course-card course-card--enter"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div
                  className="course-card__image"
                  style={{ backgroundImage: backdrop }}
                  role="img"
                  aria-label={course.title}
                />
                <div className="course-card__overlay">
                  {course.code ? (
                    <span className="course-card__code">{course.code}</span>
                  ) : null}
                  <span className="course-card__name">{course.title}</span>
                </div>
                <button
                  type="button"
                  className="course-card__click"
                  onClick={() => openCourse(course)}
                  aria-label={`Open ${course.title} dashboard`}
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
