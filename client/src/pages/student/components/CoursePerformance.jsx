    import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

// Sample values until real course/grade data is wired up.
const SAMPLE_TITLE = "Web Development";
const SAMPLE_PERFORMANCE = 92;

// Color + text label bands (text label so meaning isn't color-only).
function performanceBand(value) {
  if (value >= 90) return { color: "#2e9e5b", label: "Excellent" };
  if (value >= 75) return { color: "#2f6fed", label: "Good" };
  if (value >= 60) return { color: "#e0a92e", label: "Fair" };
  return { color: "#d64545", label: "Needs Work" };
}

function CoursePerformance({ title, performance = SAMPLE_PERFORMANCE }) {
  const location = useLocation();
  // Show the course the student clicked through from, if any.
  const courseTitle = title || location.state?.title || SAMPLE_TITLE;

  const value = Math.max(0, Math.min(100, Math.round(performance)));
  const { color, label } = performanceBand(value);

  // Animate the bar from 0 to its value on mount.
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFill(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <section className="course-top">
      <h2 className="course-top__title">{courseTitle}</h2>

      <span className="course-top__pill">Overall Performance</span>

      <p className="course-top__value" style={{ color }}>
        {value}%
      </p>

      <span className="course-top__band" style={{ color, borderColor: color }}>
        {label}
      </span>

      <div
        className="course-top__bar"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Overall performance: ${label}`}
      >
        <div
          className="course-top__bar-fill"
          style={{ width: `${fill}%`, backgroundColor: color }}
        />
      </div>
    </section>
  );
}

export default CoursePerformance;
