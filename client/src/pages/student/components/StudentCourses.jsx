import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStoredSession } from "../../../auth/services/authService";
import { courseImageUrl, fetchStudentCourses } from "../../../services/courses";
import { applySuspension, useStanding } from "../../../lib/useStanding";
import noCoursesImage from "../../../assets/no-courses-student.png";
import {
  formatCourseEnded,
  formatCourseRun,
  hasCourseEnded
} from "../../../lib/courseDuration";

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
 * The server derives `status` from what the student has worked through — the
 * lessons read, the quizzes passed and the final — but the card recomputes it
 * from the counts when an older response omits it,
 * so a missing field degrades to "not started" rather than to a blank chip.
 * Every state carries a word as well as a colour — the dot alone never
 * carries the meaning.
 */
const STATUSES = {
  completed: { id: "completed", label: "Completed" },
  "in-progress": { id: "in-progress", label: "In progress" },
  "not-started": { id: "not-started", label: "Not started" },
  // Not a progress state but the course's own. It outranks the other three
  // because it is the one that changes what the student may still do: an
  // ended course is read-only, and the server refuses the rest.
  ended: { id: "ended", label: "Ended" },
  // The admin switched this student's class off. It outranks "ended" in turn,
  // because it shuts the card rather than making it read-only.
  suspended: { id: "suspended", label: "Unavailable" }
};

// The server sends `ended` with every course; the date rule is the fallback.
const isEnded = (course) => course.ended ?? hasCourseEnded(course);

// Sent only by a server that knows about classes; an older response has no
// field, and no switched-off class either.
const isSuspended = (course) => Boolean(course.suspended);

/**
 * What the course is worth, and how much of it is behind them.
 *
 * Not the lessons alone: a course is its lessons, a quiz for each of them and
 * one final, and the server counts all three (see progressSummary in
 * courses.controller.js). A card that counted only the reading called a course
 * finished with every paper still to sit.
 *
 * `moduleCount` and `completedModules` are the fallback rather than the answer.
 * They are the lesson figures, which is all a server from before this change
 * sends — a card that showed nothing at all would be worse than one showing the
 * older, smaller sum.
 */
function tallyOf(course) {
  const total = Number(course.itemCount ?? course.moduleCount) || 0;
  if (!total) return { total: 0, done: 0 };

  const done = Math.min(Number(course.completedItems ?? course.completedModules) || 0, total);
  return { total, done };
}

function statusOf(course) {
  if (isSuspended(course)) return STATUSES.suspended;
  if (isEnded(course)) return STATUSES.ended;
  if (STATUSES[course.status]) return STATUSES[course.status];

  const { total, done } = tallyOf(course);
  if (total > 0 && done >= total) return STATUSES.completed;
  return done > 0 ? STATUSES["in-progress"] : STATUSES["not-started"];
}

function doneLine(course) {
  const { total, done } = tallyOf(course);
  if (!total) return "No lessons yet";

  return `${done} of ${total} done`;
}

// Recomputed from the counts rather than read from `progress`, so the bar and
// the "8 of 25" beside it can never disagree.
function percentOf(course) {
  const { total, done } = tallyOf(course);
  return total ? Math.round((done / total) * 100) : 0;
}

function StudentCourses() {
  const navigate = useNavigate();
  const [fetched, setFetched] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * The cards as they stand now, rather than as they were fetched.
   *
   * This list is read once, on arrival, and then left on screen — a student
   * picks a course out of it and comes back to it. A course closed while they
   * were looking at it would otherwise still be offered here, and open to a
   * press, until something made the page load again.
   *
   * Only after the server has answered. Until then the cards are as they were
   * served, which is the freshest thing anybody here knows.
   */
  const { courses: closed, known } = useStanding();
  const courses = useMemo(
    () =>
      known
        ? fetched.map((course) => applySuspension(course, closed[String(course.id)]))
        : fetched,
    [fetched, closed, known]
  );

  const openCourse = (course) => {
    // A switched-off class has no lessons to open. The reader turns the same
    // student away on its own — this only spares them the trip.
    if (isSuspended(course)) return;

    navigate(`/student/courses/${course.id}/modules`, {
      state: { title: course.title }
    });
  };

  useEffect(() => {
    let active = true;
    const studentId = getStoredSession()?.user?.id;

    fetchStudentCourses(studentId)
      .then((list) => {
        if (active) setFetched(list);
      })
      .catch(() => {
        if (active) setFetched([]);
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

    const count = (id) => courses.filter((course) => statusOf(course).id === id).length;
    const active = count("in-progress");
    const done = count("completed");
    const ended = count("ended");
    const closed = count("suspended");
    const parts = [`${courses.length} ${courses.length === 1 ? "course" : "courses"}`];

    if (active) parts.push(`${active} in progress`);
    if (done) parts.push(`${done} completed`);
    // A closed course is neither of those any more, so without these the line
    // under the heading would not add up to the cards under it.
    if (ended) parts.push(`${ended} ended`);
    if (closed) parts.push(`${closed} unavailable`);
    return parts.join(" · ");
  }, [courses]);

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
        </div>
      ) : (
        <ul className="student-courses__list">
          {courses.map((course, index) => {
            const backdrop = course.hasImage
              ? `url(${courseImageUrl(course.id, course.imageUpdatedAt)})`
              : course.imageUrl
                ? `url(${course.imageUrl})`
                : PLACEHOLDER_GRADIENTS[index % PLACEHOLDER_GRADIENTS.length];

            const status = statusOf(course);
            const percent = percentOf(course);
            const tally = tallyOf(course);
            const lessons = doneLine(course);
            const run = formatCourseRun(course);
            const ended = status.id === "ended";
            const suspended = status.id === "suspended";

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
                  {run ? <span className="course-card__run">{run}</span> : null}
                  {/* The chip says the course is over; this says what that means
                      for the student, since the card is still theirs to open. */}
                  {ended ? (
                    <span className="course-card__ended">
                      {formatCourseEnded(course)} · read-only
                    </span>
                  ) : null}
                  {/* The chip says the course cannot be opened; this says why,
                      and that it is the class rather than anything the student
                      did or failed to do. */}
                  {suspended ? (
                    <span className="course-card__closed">
                      {course.suspendedReason ??
                        "Your class for this course is switched off, so its lessons are closed for now."}
                    </span>
                  ) : null}

                  <div className="course-card__progress" aria-hidden="true">
                    <span className="course-card__track">
                      <span className="course-card__fill" style={{ width: `${percent}%` }} />
                    </span>
                    <span className="course-card__progress-text">
                      <span>{lessons}</span>
                      {tally.total ? <span>{percent}%</span> : null}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="course-card__click"
                  onClick={() => openCourse(course)}
                  disabled={suspended}
                  aria-label={
                    suspended
                      ? `${course.title} — unavailable. ${
                          course.suspendedReason ??
                          "Your class for this course is switched off."
                        }`
                      : `Open ${course.title} learning modules — ${status.label}${
                          ended ? ", read-only" : ""
                        }, ${lessons}`
                  }
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
