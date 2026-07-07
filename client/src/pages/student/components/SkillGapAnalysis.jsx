import { useEffect, useState } from "react";

// Color + text label bands: green = high, yellow = medium, red = low.
function skillBand(value) {
  if (value >= 80) return { color: "#2e9e5b", label: "High" };
  if (value >= 60) return { color: "#e0a92e", label: "Medium" };
  return { color: "#d64545", label: "Low" };
}

function SkillGapAnalysis({ skills = [] }) {
  // Animate every bar from 0 to its value once mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Weakest skill = the focus area to highlight.
  const focus = skills.length
    ? skills.reduce((lowest, skill) => (skill.score < lowest.score ? skill : lowest))
    : null;

  return (
    <section className="skill-gap">
      <h2 className="skill-gap__title">Skill Gap Analysis</h2>

      {skills.length === 0 ? (
        <p className="dash-courses__empty">
          No skill data for this course yet. Your scores will appear here once
          your assessments are graded.
        </p>
      ) : (
        <>
          <div className="skill-gap__head" aria-hidden="true">
            <span>Topic</span>
            <span></span>
            <span>Score</span>
          </div>

          <ul className="skill-gap__list">
            {skills.map(({ topic, score }) => {
              const value = Math.max(0, Math.min(100, Math.round(score)));
              const { color, label } = skillBand(value);

              return (
                <li key={topic} className="skill-row">
                  <span className="skill-row__topic">{topic}</span>

                  <div
                    className="skill-row__bar"
                    role="progressbar"
                    aria-valuenow={value}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${topic}: ${label}`}
                  >
                    <div
                      className="skill-row__fill"
                      style={{ width: `${mounted ? value : 0}%`, backgroundColor: color }}
                    />
                  </div>

                  <span className="skill-row__meta">
                    <span className="skill-row__score" style={{ color }}>
                      {value}%
                    </span>
                    <span className="skill-row__level" style={{ color }}>
                      {label}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {focus ? (
            <p className="skill-gap__focus">
              <span className="skill-gap__focus-dot" aria-hidden="true" />
              Focus area: <strong>{focus.topic}</strong> is your lowest skill (
              {Math.round(focus.score)}%). A little practice here goes a long way.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

export default SkillGapAnalysis;
