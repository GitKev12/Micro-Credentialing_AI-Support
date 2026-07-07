import { useEffect, useMemo, useState } from "react";
import StudentSidebar from "./components/StudentSidebar";
import CoursePerformance from "./components/CoursePerformance";
import SkillGapAnalysis from "./components/SkillGapAnalysis";
import { getStoredSession } from "../../auth/services/authService";
import { fetchStudentSkillGap } from "../../services/skillGap";
import noCoursesImage from "../../assets/no-courses-student.png";

// Placeholder backdrops shown until real course pictures exist (course.imageUrl).
const PLACEHOLDER_GRADIENTS = [
  "linear-gradient(135deg, #2563eb, #1e3a8a)",
  "linear-gradient(135deg, #0ea5e9, #0369a1)",
  "linear-gradient(135deg, #6366f1, #3730a3)",
  "linear-gradient(135deg, #14b8a6, #0f766e)"
];

const TABS = [
  { id: "all", label: "All" },
  { id: "in-progress", label: "In Progress" },
  { id: "completed", label: "Completed" }
];

const PAGE_SIZE = 6;

// Band color for the on-card performance badge + progress bar.
function bandColor(value) {
  if (value >= 90) return "#2e9e5b";
  if (value >= 75) return "#2f6fed";
  if (value >= 60) return "#e0a92e";
  return "#d64545";
}

function StudentDashboard() {
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Per-course performance + skills, from the CoursePerformance collection.
  useEffect(() => {
    let active = true;
    const studentId = getStoredSession()?.user?.id;

    fetchStudentSkillGap(studentId)
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

  // Animate the on-card progress bars from 0 on first load.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Courses matching the active tab + search query.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses.filter((course) => {
      const matchesTab = activeTab === "all" || course.status === activeTab;
      const matchesQuery = course.title.toLowerCase().includes(q);
      return matchesTab && matchesQuery;
    });
  }, [courses, query, activeTab]);

  // Reset how many are shown whenever the filter changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, activeTab]);

  const visibleCourses = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const tabCount = (tabId) =>
    tabId === "all"
      ? courses.length
      : courses.filter((course) => course.status === tabId).length;

  if (selected) {
    return (
      <div className="student-body">
        <StudentSidebar />
        <main className="student-main">
          <button
            type="button"
            className="dash-back"
            onClick={() => setSelected(null)}
          >
            <span aria-hidden="true">←</span> Back to courses
          </button>

          <CoursePerformance
            title={selected.title}
            performance={selected.performance}
          />
          <SkillGapAnalysis skills={selected.skills} />
        </main>
      </div>
    );
  }

  return (
    <div className="student-body">
      <StudentSidebar />

      <main className="student-main">
        <section className="dash-courses">
          {isLoading ? (
            <ul className="dash-courses__grid" aria-hidden="true">
              {Array.from({ length: PAGE_SIZE }).map((_, index) => (
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
                No course analytics yet
              </p>
              <p className="student-courses__empty-text">
                Your skill gap analysis will show up here once your assessment
                results are in.
              </p>
            </div>
          ) : (
            <>
              <div className="dash-courses__bar">
                <h2 className="dash-courses__title">Your Courses</h2>

                <div className="dash-search">
                  <svg
                    className="dash-search__icon"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="search"
                    className="dash-search__input"
                    placeholder="Filter courses…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Filter courses by name"
                  />
                </div>
              </div>

              <div className="dash-tabs" role="tablist" aria-label="Course status">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    className={`dash-tab${activeTab === tab.id ? " is-active" : ""}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label} <span className="dash-tab__count">{tabCount(tab.id)}</span>
                  </button>
                ))}
              </div>

              {visibleCourses.length === 0 ? (
                <p className="dash-courses__empty">No courses match your filter.</p>
              ) : (
                <ul className="dash-courses__grid">
                  {visibleCourses.map((course, index) => {
                    const value = Math.max(0, Math.min(100, Math.round(course.performance)));
                    const color = bandColor(value);
                    const backdrop = course.imageUrl
                      ? `url(${course.imageUrl})`
                      : PLACEHOLDER_GRADIENTS[index % PLACEHOLDER_GRADIENTS.length];

                    return (
                      <li key={course.id} className="course-card course-card--stat">
                        <div
                          className="course-card__image"
                          style={{ backgroundImage: backdrop }}
                          role="img"
                          aria-label={course.title}
                        />

                        {course.icon ? (
                          <span className="course-card__icon" aria-hidden="true">
                            {course.icon}
                          </span>
                        ) : null}

                        <span className="course-card__badge" style={{ color }}>
                          {value}%
                        </span>

                        <div className="course-card__overlay">
                          <span className="course-card__name">{course.title}</span>

                          <div
                            className="course-card__progress"
                            role="progressbar"
                            aria-valuenow={value}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${course.title} overall performance`}
                          >
                            <div
                              className="course-card__progress-fill"
                              style={{ width: `${mounted ? value : 0}%`, backgroundColor: color }}
                            />
                          </div>

                          <span className="course-card__cta">View analysis →</span>
                        </div>

                        <button
                          type="button"
                          className="course-card__click"
                          onClick={() => setSelected(course)}
                          aria-label={`View ${course.title} skill gap analysis`}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              {hasMore ? (
                <div className="dash-more-wrap">
                  <button
                    type="button"
                    className="dash-more"
                    onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  >
                    Show more
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default StudentDashboard;
