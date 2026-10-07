import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getStoredSession } from "../../auth/services/authService";
import { fetchDiscoverCourses } from "../../services/discover";
import { formatCourseRange, formatCourseLength } from "../../lib/courseDuration";
import CourseCover from "./components/CourseCover";
import DiscoverBar, { NO_FILTERS, matchesDiscover } from "./components/DiscoverBar";
import { EmptyState } from "./components/ui";
import noCoursesImage from "../../assets/no-courses-student.png";

export default function DiscoverPage() {
  const [courses, setCourses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const studentId = getStoredSession()?.user?.id;
  // What the search bar narrows the cards by.
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [ticked, setTicked] = useState(NO_FILTERS);

  useEffect(() => {
    let current = true;
    setStatus("loading");
    fetchDiscoverCourses(studentId).then((rows) => {
      if (current) { setCourses(rows); setStatus("ready"); }
    }).catch(() => { if (current) setStatus("error"); });
    return () => { current = false; };
  }, [studentId, attempt]);

  // Each category the courses use, with how many courses are in it.
  const categories = useMemo(() => {
    const counts = new Map();
    for (const course of courses) {
      if (course.category) counts.set(course.category, (counts.get(course.category) ?? 0) + 1);
    }
    return [...counts]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [courses]);

  const narrowing = Boolean(query.trim() || category || Object.values(ticked).some((list) => list.length > 0));
  const visible = courses.filter((course) => matchesDiscover(course, { query, category, ticked }));

  const tick = (group, value) =>
    setTicked((current) => {
      const list = current[group];
      return { ...current, [group]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });
  const clearAll = () => {
    setQuery("");
    setCategory("");
    setTicked(NO_FILTERS);
  };

  return (
    <main className="sd-discover">
      {/* The rail already says where you are, so the heading is for screen
          readers only — the page still needs one to sit under. */}
      <h1 className="sd-sr-only">Discover</h1>
      {/* Not shown when there is nothing to search. */}
      {status === "ready" && courses.length === 0 ? null : (
        <DiscoverBar
          query={query}
          onQuery={setQuery}
          courseCount={courses.length}
          categories={categories}
          category={category}
          onCategory={setCategory}
          ticked={ticked}
          onTick={tick}
          onClear={() => setTicked(NO_FILTERS)}
        />
      )}
      {status === "loading" ? (
        <ul className="sd-discover__grid" aria-label="Loading courses" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <li key={i} className="sd-dcard sd-dcard--skeleton" aria-hidden="true"><div className="sd-skeleton sd-dcard__cover" /><div className="sd-dcard__body"><div className="sd-skeleton" /><div className="sd-skeleton" /></div></li>)}
        </ul>
      ) : status === "error" ? (
        <div className="sd-discover__error" role="alert">Couldn't load courses. <button className="sd-btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button></div>
      ) : courses.length === 0 ? <EmptyState image={noCoursesImage} title="No courses are open for enrollment yet." /> : (
        <>
          {/* Only while narrowing: the rest of the time the grid speaks for itself. */}
          {narrowing ? (
            <p className="sd-discover__count" role="status">
              {visible.length} of {courses.length} {courses.length === 1 ? "course" : "courses"}
            </p>
          ) : null}
          {visible.length === 0 ? (
            <div className="sd-discover__none">
              <p>No courses match.</p>
              <button type="button" className="sd-btn" onClick={clearAll}>Clear search and filters</button>
            </div>
          ) : (
            <ul className="sd-discover__grid">
              {visible.map((course) => <DiscoverCard key={course.id} course={course} />)}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

/** One course on the grid; the whole card opens the course view. */
function DiscoverCard({ course }) {
  return (
    <li className="sd-dcard">
      <CourseCover course={course} className="sd-dcard__cover" />
      <div className="sd-dcard__body">
        <span className="sd-dcard__code">{course.code}</span>
        <h2 className="sd-dcard__title"><Link className="sd-dcard__link" to={`/student/discover/${course.id}`}>{course.title}</Link></h2>
        <div className="sd-dcard__when"><span>{formatCourseRange(course)}</span><span>{formatCourseLength(course)}</span></div>
        {/* The category, not a section count: how many sections a course is
            split into is how the school sorts its students, not something a
            candidate choosing a course has any use for. */}
        <div className="sd-dcard__foot">
          <span className="sd-dcard__category">{course.category}</span>
          {course.enrolled ? <span className="sd-state" data-state="enrolled">Enrolled</span> : course.pending ? <span className="sd-state" data-state="pending">Request pending</span> : null}
        </div>
      </div>
    </li>
  );
}
