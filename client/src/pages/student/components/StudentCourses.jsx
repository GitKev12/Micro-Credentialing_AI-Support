import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStoredSession } from "../../../auth/services/authService";
import { courseImageUrl, fetchStudentCourses } from "../../../services/courses";
import { applySuspension, useStanding } from "../../../lib/useStanding";
import noCoursesImage from "../../../assets/no-courses-student.png";
import {
  daysLeftInRun,
  formatCourseEnded,
  formatCourseRange,
  hasCourseEnded
} from "../../../lib/courseDuration";
import { CheckIcon, ChevronDownIcon, LockIcon } from "./icons";

/**
 * Where the student stands in a course.
 *
 * The server derives `status` from what the student has worked through — the
 * lessons read, the quizzes passed and the final — but the page recomputes it
 * from the counts when an older response omits it, so a missing field degrades
 * to "not started" rather than to nothing.
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
  // because it shuts the course rather than making it read-only.
  suspended: { id: "suspended", label: "Unavailable" }
};

// The page is grouped by these, in this order. A group with no courses in it
// is not drawn at all. Ended and switched-off courses share one: each row says
// which it is, and neither is somewhere the student has work left to do.
const GROUPS = [
  { id: "in-progress", label: "In progress", statuses: ["in-progress"] },
  { id: "not-started", label: "Not started", statuses: ["not-started"] },
  { id: "completed", label: "Completed", statuses: ["completed"] },
  { id: "closed", label: "Closed", statuses: ["ended", "suspended"] }
];

const isOpen = (course) => {
  const { id } = statusOf(course);
  return id === "in-progress" || id === "not-started";
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
 * courses.controller.js).
 *
 * `moduleCount` and `completedModules` are the fallback rather than the answer.
 * They are the lesson figures, which is all an older server sends — a page that
 * showed nothing at all would be worse than one showing the smaller sum.
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

// Recomputed from the counts rather than read from `progress`, so the figure
// and the path beside it can never disagree.
function percentOf(course) {
  const { total, done } = tallyOf(course);
  return total ? Math.round((done / total) * 100) : 0;
}

/**
 * The course split into its three stretches: the lessons, a quiz for each of
 * them, and the final.
 *
 * The server sends two counts — lessons read, and everything done — so what
 * has been passed is the difference. The final is only known to be among it
 * once that difference runs past the number of quizzes there can be, or the
 * course is complete. Until then it all counts as quizzes, which misreads just
 * one case: a final passed while some lesson quizzes were never posted.
 */
function pathOf(course) {
  const lessons = Math.max(0, Number(course.moduleCount) || 0);
  const read = Math.min(Math.max(0, Number(course.completedModules) || 0), lessons);
  const passed = Math.max(0, tallyOf(course).done - read);
  const finalPassed = course.status === "completed" || (lessons > 0 && passed > lessons);
  const quizzes = Math.max(0, Math.min(finalPassed ? passed - 1 : passed, lessons));

  return { lessons, read, quizzes, finalPassed };
}

/** "12 days left", or null when the run has no end date or is already over. */
function timeLeftOf(course) {
  const days = daysLeftInRun(course);
  if (days == null || days < 0) return null;
  if (days === 0) return { text: "Ends today", soon: true };
  if (days === 1) return { text: "Ends tomorrow", soon: true };
  return { text: `${days} days left`, soon: days <= 7 };
}

const endTime = (course) => {
  const time = course.endsOn ? new Date(course.endsOn).getTime() : NaN;
  return Number.isNaN(time) ? Infinity : time;
};

/**
 * Which open course needs the student first.
 *
 * One they have started comes before one they have not, then the one whose run
 * ends soonest — once it ends, its quizzes and final close — then the one
 * closest to done. Courses with no end date go last, since nothing is closing
 * on them.
 */
function byUrgency(a, b) {
  const started = Number(statusOf(b).id === "in-progress") - Number(statusOf(a).id === "in-progress");
  if (started) return started;

  // Two courses with no end date subtract to NaN, which is falsy: a tie.
  const ends = endTime(a) - endTime(b);
  if (ends) return ends;

  return percentOf(b) - percentOf(a);
}

function coverSrc(course) {
  if (course.hasImage) return courseImageUrl(course.id, course.imageUpdatedAt);
  return course.imageUrl || null;
}

/**
 * A course's picture, or its code set as one when it has none.
 *
 * The code is drawn either way and the picture laid over it, so a picture that
 * fails to load leaves the code showing rather than an empty box. Decorative:
 * the title and code are always written out beside it.
 */
function CourseCover({ course, className }) {
  const src = coverSrc(course);
  const mark = course.code || course.title.split(/\s+/).slice(0, 2).map((word) => word[0]).join("");

  return (
    <div className={`sd-cover ${className}`} aria-hidden="true">
      <span className="sd-cover__mark">
        {String(mark)
          .split(/\s+/)
          .map((part, index) => (
            <span key={index}>{part}</span>
          ))}
      </span>
      {src ? <span className="sd-cover__img" style={{ backgroundImage: `url(${src})` }} /> : null}
    </div>
  );
}

const share = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : "0%");

/** The course's three stretches, drawn with their counts under them. */
function CoursePath({ path }) {
  return (
    <div className="sd-path">
      <div className="sd-path__stage">
        <span className="sd-path__label">Lessons</span>
        <span className="sd-path__track">
          <span className="sd-path__fill" style={{ "--fill": share(path.read, path.lessons) }} />
        </span>
        <span className="sd-path__count">
          {path.read} of {path.lessons}
        </span>
      </div>

      <div className="sd-path__stage">
        <span className="sd-path__label">Quizzes</span>
        <span className="sd-path__track">
          <span className="sd-path__fill" style={{ "--fill": share(path.quizzes, path.lessons) }} />
        </span>
        <span className="sd-path__count">
          {path.quizzes} of {path.lessons}
        </span>
      </div>

      <div className="sd-path__stage sd-path__stage--final" data-done={path.finalPassed}>
        <span className="sd-path__label">Final exam</span>
        <span className="sd-path__node">{path.finalPassed ? <CheckIcon size={11} /> : null}</span>
        <span className="sd-path__count">{path.finalPassed ? "Passed" : "Not yet"}</span>
      </div>
    </div>
  );
}

/** The same path at row size: no words, so the row carries them instead. */
function MiniPath({ path }) {
  return (
    <span className="sd-minipath" aria-hidden="true">
      <span className="sd-minipath__track">
        <span className="sd-minipath__fill" style={{ width: share(path.read, path.lessons) }} />
      </span>
      <span className="sd-minipath__track">
        <span className="sd-minipath__fill" style={{ width: share(path.quizzes, path.lessons) }} />
      </span>
      <span className="sd-minipath__node" data-done={path.finalPassed} />
    </span>
  );
}

function FeaturedCourse({ course, onOpen }) {
  const range = formatCourseRange(course);
  const left = timeLeftOf(course);
  const started = tallyOf(course).done > 0;

  return (
    <article className="sd-feature" aria-labelledby="sd-feature-title">
      <CourseCover course={course} className="sd-feature__cover" />

      <div className="sd-feature__body">
        <div>
          {course.code ? <p className="sd-feature__code">{course.code}</p> : null}
          <h2 className="sd-feature__title" id="sd-feature-title">
            {course.title}
          </h2>
          {range || left ? (
            <p className="sd-when">
              {range ? <span>{range}</span> : null}
              {left ? (
                <span className="sd-when__left" data-soon={left.soon || undefined}>
                  {left.text}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        <CoursePath path={pathOf(course)} />

        <div>
          <button type="button" className="sd-feature__go" onClick={onOpen}>
            {started ? "Continue course" : "Start course"}
          </button>
        </div>
      </div>
    </article>
  );
}

function CourseRow({ course, onOpen }) {
  const status = statusOf(course);
  const { total, done } = tallyOf(course);
  const suspended = status.id === "suspended";
  const ended = status.id === "ended";
  const range = formatCourseRange(course);
  const left = isOpen(course) ? timeLeftOf(course) : null;
  const path = pathOf(course);

  const progress = total
    ? `${done} of ${total} done, ${path.read} of ${path.lessons} lessons, ${path.quizzes} of ${
        path.lessons
      } quizzes, final exam ${path.finalPassed ? "passed" : "not passed yet"}`
    : "No lessons yet";

  return (
    <li className="sd-row" data-status={status.id}>
      <CourseCover course={course} className="sd-row__cover" />

      <div className="sd-row__text">
        {course.code ? <span className="sd-row__code">{course.code}</span> : null}
        <h3 className="sd-row__title">
          <button
            type="button"
            className="sd-row__open"
            onClick={onOpen}
            // A switched-off class has no lessons to open. The reader turns the
            // same student away on its own — this only spares them the trip.
            disabled={suspended}
          >
            {course.title}
          </button>
        </h3>

        {suspended ? (
          <p className="sd-row__meta sd-row__meta--closed">
            <LockIcon size={13} />
            {course.suspendedReason ??
              "Your class for this course is switched off, so its lessons are closed for now."}
          </p>
        ) : ended ? (
          <p className="sd-row__meta">
            <span>{formatCourseEnded(course)}</span>
            <span className="sd-chip">Read-only</span>
          </p>
        ) : range || left ? (
          <p className="sd-row__meta">
            {range ? <span>{range}</span> : null}
            {left ? (
              <span className="sd-when__left" data-soon={left.soon || undefined}>
                {left.text}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="sd-row__progress">
        <span className="sd-sr-only">{progress}</span>
        {total ? (
          <>
            <MiniPath path={path} />
            <span className="sd-row__pct" aria-hidden="true">
              {percentOf(course)}%
            </span>
          </>
        ) : (
          <span className="sd-row__none" aria-hidden="true">
            No lessons yet
          </span>
        )}
      </div>

      <span className="sd-row__chevron" aria-hidden="true">
        {suspended ? null : <ChevronDownIcon size={16} />}
      </span>
    </li>
  );
}

function StudentCourses() {
  const navigate = useNavigate();
  const [fetched, setFetched] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * The courses as they stand now, rather than as they were fetched.
   *
   * This list is read once, on arrival, and then left on screen — a student
   * picks a course out of it and comes back to it. A course closed while they
   * were looking at it would otherwise still be offered here, and open to a
   * press, until something made the page load again.
   *
   * Only after the server has answered. Until then the courses are as they
   * were served, which is the freshest thing anybody here knows.
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

  // The open course that needs the student first leads the page; every other
  // course falls into the group for where it stands.
  const { featured, groups } = useMemo(() => {
    const lead =
      courses.filter((course) => isOpen(course) && tallyOf(course).total > 0).sort(byUrgency)[0] ??
      null;
    const rest = courses.filter((course) => course !== lead);

    return {
      featured: lead,
      groups: GROUPS.map((group) => {
        const members = rest.filter((course) => group.statuses.includes(statusOf(course).id));
        // Open courses in the same order that chose the lead; finished and
        // closed ones in the order they were enrolled in.
        if (members.some(isOpen)) members.sort(byUrgency);
        return { ...group, courses: members };
      }).filter((group) => group.courses.length > 0)
    };
  }, [courses]);

  return (
    <section className="sd-home" aria-labelledby="sd-home-title">
      <h1 className="sd-sr-only" id="sd-home-title">
        My courses
      </h1>

      {isLoading ? (
        <>
          <div className="sd-skeleton sd-home__skeleton-feature" aria-hidden="true" />
          <div className="sd-home__skeleton-rows" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="sd-skeleton sd-home__skeleton-row" />
            ))}
          </div>
          <p className="sd-sr-only" role="status">
            Loading your courses…
          </p>
        </>
      ) : courses.length === 0 ? (
        <div className="sd-empty">
          <img className="sd-empty__img" src={noCoursesImage} alt="" aria-hidden="true" />
          <p className="sd-empty__title">You aren&apos;t enrolled in any courses yet</p>
        </div>
      ) : (
        <>
          {featured ? (
            <FeaturedCourse course={featured} onOpen={() => openCourse(featured)} />
          ) : null}

          {groups.map((group) => (
            <section
              key={group.id}
              className="sd-group"
              aria-labelledby={`sd-group-${group.id}`}
            >
              <h2 className="sd-group__title" id={`sd-group-${group.id}`}>
                {group.label}
              </h2>
              <ul className="sd-rows">
                {group.courses.map((course) => (
                  <CourseRow key={course.id} course={course} onOpen={() => openCourse(course)} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </section>
  );
}

export default StudentCourses;
