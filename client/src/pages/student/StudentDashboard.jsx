import { useEffect, useMemo, useState } from "react";
import StudentSidebar from "./components/StudentSidebar";
import CoursePerformance from "./components/CoursePerformance";
import SkillGapAnalysis from "./components/SkillGapAnalysis";

// Sample per-course analytics until real course/skill data is wired up.
const SAMPLE_COURSES = [
  {
    id: "web-dev",
    title: "Web Development",
    icon: "🌐",
    status: "in-progress",
    performance: 92,
    gradient: "linear-gradient(135deg, #2563eb, #1e3a8a)",
    skills: [
      { topic: "HTML", score: 92 },
      { topic: "CSS", score: 88 },
      { topic: "JavaScript", score: 74 },
      { topic: "React", score: 60 },
      { topic: "Node.js", score: 48 }
    ]
  },
  {
    id: "data-science",
    title: "Data Science",
    icon: "📊",
    status: "in-progress",
    performance: 78,
    gradient: "linear-gradient(135deg, #14b8a6, #0f766e)",
    skills: [
      { topic: "Python", score: 90 },
      { topic: "Pandas", score: 82 },
      { topic: "SQL", score: 66 },
      { topic: "Statistics", score: 70 },
      { topic: "Machine Learning", score: 54 }
    ]
  },
  {
    id: "ui-ux",
    title: "UI/UX Design",
    icon: "🎨",
    status: "completed",
    performance: 85,
    gradient: "linear-gradient(135deg, #7c3aed, #4c1d95)",
    skills: [
      { topic: "Figma", score: 90 },
      { topic: "Wireframing", score: 86 },
      { topic: "Prototyping", score: 80 },
      { topic: "User Research", score: 72 }
    ]
  },
  {
    id: "cybersecurity",
    title: "Cybersecurity",
    icon: "🔒",
    status: "in-progress",
    performance: 63,
    gradient: "linear-gradient(135deg, #334155, #0f172a)",
    skills: [
      { topic: "Networking", score: 70 },
      { topic: "Cryptography", score: 58 },
      { topic: "Pen Testing", score: 55 },
      { topic: "Security Ops", score: 66 }
    ]
  },
  {
    id: "cloud",
    title: "Cloud Computing",
    icon: "☁️",
    status: "in-progress",
    performance: 71,
    gradient: "linear-gradient(135deg, #0ea5e9, #0369a1)",
    skills: [
      { topic: "AWS", score: 75 },
      { topic: "Docker", score: 68 },
      { topic: "Kubernetes", score: 60 },
      { topic: "Networking", score: 72 }
    ]
  },
  {
    id: "mobile",
    title: "Mobile Development",
    icon: "📱",
    status: "completed",
    performance: 88,
    gradient: "linear-gradient(135deg, #6366f1, #3730a3)",
    skills: [
      { topic: "React Native", score: 88 },
      { topic: "Flutter", score: 80 },
      { topic: "iOS", score: 76 },
      { topic: "Android", score: 84 }
    ]
  },
  {
    id: "database",
    title: "Database Systems",
    icon: "🗄️",
    status: "in-progress",
    performance: 54,
    gradient: "linear-gradient(135deg, #f59e0b, #b45309)",
    skills: [
      { topic: "SQL", score: 62 },
      { topic: "Normalization", score: 50 },
      { topic: "Indexing", score: 48 },
      { topic: "NoSQL", score: 56 }
    ]
  },
  {
    id: "machine-learning",
    title: "Machine Learning",
    icon: "🤖",
    status: "completed",
    performance: 80,
    gradient: "linear-gradient(135deg, #22c55e, #15803d)",
    skills: [
      { topic: "Python", score: 88 },
      { topic: "NumPy", score: 82 },
      { topic: "Modeling", score: 74 },
      { topic: "Deployment", score: 66 }
    ]
  }
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
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Animate the on-card progress bars from 0 on first load.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Courses matching the active tab + search query.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SAMPLE_COURSES.filter((course) => {
      const matchesTab = activeTab === "all" || course.status === activeTab;
      const matchesQuery = course.title.toLowerCase().includes(q);
      return matchesTab && matchesQuery;
    });
  }, [query, activeTab]);

  // Reset how many are shown whenever the filter changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, activeTab]);

  const visibleCourses = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const tabCount = (tabId) =>
    tabId === "all"
      ? SAMPLE_COURSES.length
      : SAMPLE_COURSES.filter((course) => course.status === tabId).length;

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
              {visibleCourses.map((course) => {
                const value = Math.max(0, Math.min(100, Math.round(course.performance)));
                const color = bandColor(value);

                return (
                  <li key={course.id} className="course-card course-card--stat">
                    <div
                      className="course-card__image"
                      style={{ backgroundImage: course.gradient }}
                      role="img"
                      aria-label={course.title}
                    />

                    <span className="course-card__icon" aria-hidden="true">
                      {course.icon}
                    </span>

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
        </section>
      </main>
    </div>
  );
}

export default StudentDashboard;
