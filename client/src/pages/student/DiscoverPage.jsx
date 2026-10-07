import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStoredSession } from "../../auth/services/authService";
import { fetchDiscoverCourses } from "../../services/discover";
import { formatCourseRange, formatCourseLength } from "../../lib/courseDuration";
import CourseCover from "./components/CourseCover";
import { EmptyState } from "./components/ui";
import noCoursesImage from "../../assets/no-courses-student.png";

export default function DiscoverPage() {
  const [courses, setCourses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const studentId = getStoredSession()?.user?.id;

  useEffect(() => {
    let current = true;
    setStatus("loading");
    fetchDiscoverCourses(studentId).then((rows) => {
      if (current) { setCourses(rows); setStatus("ready"); }
    }).catch(() => { if (current) setStatus("error"); });
    return () => { current = false; };
  }, [studentId, attempt]);

  return (
    <main className="sd-discover">
      {/* The rail already says where you are, so the heading is for screen
          readers only — the page still needs one to sit under. */}
      <h1 className="sd-sr-only">Discover</h1>
      {status === "loading" ? (
        <ul className="sd-discover__grid" aria-label="Loading courses" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <li key={i} className="sd-dcard sd-dcard--skeleton" aria-hidden="true"><div className="sd-skeleton sd-dcard__cover" /><div className="sd-dcard__body"><div className="sd-skeleton" /><div className="sd-skeleton" /></div></li>)}
        </ul>
      ) : status === "error" ? (
        <div className="sd-discover__error" role="alert">Couldn't load courses. <button className="sd-btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button></div>
      ) : courses.length === 0 ? <EmptyState image={noCoursesImage} title="No courses are open for enrollment yet." /> : (
        <ul className="sd-discover__grid">
          {courses.map((course) => (
            <li key={course.id} className="sd-dcard">
              <CourseCover course={course} className="sd-dcard__cover" />
              <div className="sd-dcard__body">
                <span className="sd-dcard__code">{course.code}</span>
                <h2 className="sd-dcard__title"><Link className="sd-dcard__link" to={`/student/discover/${course.id}`}>{course.title}</Link></h2>
                <div className="sd-dcard__when"><span>{formatCourseRange(course)}</span><span>{formatCourseLength(course)}</span></div>
                <div className="sd-dcard__foot">
                  <span className="sd-dcard__sections">{course.sectionCount} {course.sectionCount === 1 ? "section" : "sections"}</span>
                  {course.enrolled ? <span className="sd-state" data-state="enrolled">Enrolled</span> : course.pending ? <span className="sd-state" data-state="pending">Request pending</span> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
