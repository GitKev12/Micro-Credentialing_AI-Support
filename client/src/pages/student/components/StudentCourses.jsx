import { useEffect, useState } from "react";
import { getStoredSession } from "../../../auth/services/authService";
import { fetchStudentCourses } from "../../../services/courses";
import noCoursesImage from "../../../assets/no-courses-student.png";

// Placeholder backdrops shown until real course pictures exist (course.imageUrl).
const PLACEHOLDER_GRADIENTS = [
  "linear-gradient(135deg, #b85722, #7d1f2b)",
  "linear-gradient(135deg, #286c58, #14342a)",
  "linear-gradient(135deg, #4b6cb7, #182848)",
  "linear-gradient(135deg, #c2682f, #6a2c12)"
];

function StudentCourses() {
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

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
        <p className="student-courses__status">Loading your courses…</p>
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
              <li key={course.id} className="course-card">
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default StudentCourses;
