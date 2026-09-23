import { courseImageUrl } from "../../../../services/courses";
import { formatCourseRun } from "../../../../lib/courseDuration";
import { CalendarIcon, ModulesIcon } from "../icons";
import { plural } from "../../lib/format";
import { courseMark } from "./impact";

/**
 * The top of one course's screen: its picture, its name, and the two facts
 * an admin opens it to check — how many lessons and when it runs.
 *
 * The picture is the one the student sees on their course card, so the admin
 * sees the course the way it is shown to students. A course without one takes
 * the letters its row carries in the list.
 */
export default function CourseHeader({ course, lessons, ready, actions }) {
  const run = ready ? formatCourseRun(course) : null;

  return (
    <header className="admin-course-hero">
      <div className="admin-course-hero__art" aria-hidden="true">
        {course.hasImage ? (
          <img src={courseImageUrl(course.id, course.imageUpdatedAt)} alt="" />
        ) : (
          <span className="admin-course-hero__mark">{courseMark(course)}</span>
        )}
      </div>

      <div className="admin-course-hero__body">
        <div className="admin-course-hero__top">
          <div className="admin-course-hero__names">
            {course.code ? <p className="admin-course-hero__code">{course.code}</p> : null}
            <h1 className="admin-course-hero__title">{course.title ?? "Course"}</h1>
          </div>
          {actions}
        </div>

        {/* Left out while the course loads: the card below is already drawing
            a skeleton, and a row of blanks here would say "loading" twice. */}
        {ready ? (
          <ul className="admin-course-hero__facts">
            <li className="admin-course-hero__fact">
              <ModulesIcon size={15} />
              {plural(lessons, "lesson")}
            </li>
            <li className="admin-course-hero__fact">
              <CalendarIcon size={15} />
              {run ?? "No dates set"}
            </li>
          </ul>
        ) : null}
      </div>
    </header>
  );
}
