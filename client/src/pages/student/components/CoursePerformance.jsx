import { useLocation } from "react-router-dom";
import { TARGET, tierBandForScore, toScore } from "../performance";
import { BandChip, Meter } from "./ui";

/**
 * The header of a single course's analysis.
 *
 * The overall score is the one number this view leads with, so it is a hero
 * figure rather than a chart — a ring gauge would be a two-slice pie, and a
 * bar chart of one bar is not a chart. The meter underneath places that
 * number against the class's target competency, which is the only comparison
 * it needs.
 */
function CoursePerformance({ title, performance = 0, skillCount = 0, cutoff = TARGET, tiers = [] }) {
  const location = useLocation();
  const courseTitle = title || location.state?.title || "Course";

  const score = toScore(performance);
  const band = tierBandForScore(score, cutoff, tiers);
  // Points under the target competency; 0 at or above it.
  const gap = Math.max(0, cutoff - score);

  return (
    <section className="sd-detail-hero" aria-labelledby="sd-course-title">
      <div>
        <p className="sd-eyebrow">Course analysis</p>
        <h1 className="sd-detail-hero__title" id="sd-course-title">
          {courseTitle}
        </h1>

        <div className="sd-detail-hero__tags">
          <BandChip band={band} />
          {skillCount ? (
            <span className="sd-chip">
              {skillCount} {skillCount === 1 ? "topic" : "topics"} assessed
            </span>
          ) : null}
          <span className="sd-chip">
            {gap > 0
              ? `${gap} points to the target competency`
              : `At or above the ${cutoff}% target competency`}
          </span>
        </div>
      </div>

      <div className="sd-detail-hero__figure">
        <p className="sd-hero__label">Overall performance</p>
        <p className="sd-hero__value">
          {score}
          <small>%</small>
        </p>
        <div className="sd-hero__meter">
          <Meter
            value={score}
            band={band}
            target={cutoff}
            label={`${courseTitle} overall performance: ${score} percent, ${band.label}`}
          />
        </div>
      </div>
    </section>
  );
}

export default CoursePerformance;
