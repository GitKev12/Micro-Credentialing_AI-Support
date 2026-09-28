import { useMemo } from "react";
import { TARGET, TIER_BANDS, tierBandFor, toScore } from "../performance";
import { BandIcon } from "./icons";
import { Meter } from "./ui";

/**
 * Per-topic scores for one course.
 *
 * Listed in the course's own lesson order, so a student can find a topic where
 * they expect it; the callout underneath names the weakest. One measure, banded
 * by the reserved status palette; the key is always on screen, every bar prints
 * its own value and the items it came from, and the figures are repeated in
 * full under Raw computation for anyone the picture does not reach.
 */
// "12 Sept 2026", or "" when there is no date.
const dayLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

function SkillGapAnalysis({ skills = [], cutoff = TARGET, tiers = [], exam = null }) {
  // The eyebrow names the paper and the day it was taken.
  const takenOn = dayLabel(exam?.takenAt);
  const examLine = [exam?.title || "Final exam", takenOn ? `Taken ${takenOn}` : ""]
    .filter(Boolean)
    .join(" · ");

  const rows = useMemo(
    () =>
      skills
        .map((skill, index) => {
          const score = toScore(skill.score);
          return {
            // Two lessons can share a title, so the key is the lesson itself
            // and the position is only the last resort.
            key: skill.moduleId ?? `${skill.topic}:${index}`,
            topic: skill.topic,
            score,
            band: tierBandFor(skill, cutoff),
            // Points under the cut-off; 0 when at or above it.
            gap: Number.isFinite(skill.gap) ? skill.gap : Math.max(0, cutoff - score),
            // How the score was arrived at: correct out of the items the final
            // asked of this lesson. Absent on anything not scored that way.
            correct: Number.isFinite(skill.correct) ? skill.correct : null,
            total: Number.isFinite(skill.total) ? skill.total : null
          };
        }),
    [skills]
  );

  const showItems = rows.some((row) => row.total !== null);

  // The paper's own totals. The server works itemsAsked out as this same sum,
  // so adding it up here cannot disagree with it.
  const items = rows.reduce(
    (sum, row) => ({
      correct: sum.correct + (row.correct ?? 0),
      total: sum.total + (row.total ?? 0)
    }),
    { correct: 0, total: 0 }
  );

  const belowTarget = rows.filter((row) => row.gap > 0);

  if (rows.length === 0) {
    return (
      <section className="sd-card">
        <p className="sd-eyebrow">Final exam</p>
        <h2 className="sd-h3">Skill gap analysis</h2>
        <p className="sd-sub">No result for this course yet.</p>
      </section>
    );
  }

  return (
    <section className="sd-card" aria-labelledby="sd-skills-title">
      <header className="sd-section-head">
        <div className="sd-section-head__text">
          {/* The paper, then the reading of it. Same two-step head the course
              card above uses, so the source labels the panel instead of
              competing with its name inside one long heading. */}
          <p className="sd-eyebrow">{examLine}</p>
          <h2 className="sd-h3" id="sd-skills-title">
            Skill gap analysis
          </h2>
          <p className="sd-sub">
            {showItems ? `${items.correct} of ${items.total} items correct. ` : ""}
            {belowTarget.length === 0
              ? `Every topic sits at or above the ${cutoff}% target competency.`
              : `${belowTarget.length} of ${rows.length} ${
                  rows.length === 1 ? "topic is" : "topics are"
                } under the ${cutoff}% target competency.`}
          </p>
        </div>
      </header>

      <div className="sd-skills__legend">
        {/* The four tiers and the range each covers for this class's cut-off,
            lowest first — the order the bars underneath are drawn in. */}
        <ul className="sd-skills__legend-tiers">
          {[...tiers]
            .sort((a, b) => a.min - b.min)
            .map((tier) => (
              <li className="sd-skills__legend-item" key={tier.id} data-band={tier.id}>
                <span className="sd-skills__legend-name">
                  <BandIcon band={tier.id} size={13} />
                  {TIER_BANDS[tier.id]?.label ?? tier.status}
                </span>
                <span className="sd-skills__legend-range">
                  {tier.min}–{tier.max}%
                </span>
              </li>
            ))}
        </ul>
      </div>

      <ul className="sd-skills__list">
        {rows.map((row) => (
          <li className="sd-skill" key={row.key} data-band={row.band.id}>
            <span className="sd-skill__topic">
              {row.topic}
              {showItems && row.total !== null ? (
                <span className="sd-skill__items">
                  {row.total > 0
                    ? `${row.correct} of ${row.total} items`
                    : "Not on this exam"}
                </span>
              ) : null}
            </span>

            <div className="sd-skill__plot">
              <Meter
                value={row.score}
                band={row.band}
                target={cutoff}
                label={`${row.topic}: ${row.score} percent, ${row.band.label}`}
              />
              {/* Hover info: one line per fact. */}
              <span className="sd-tip" role="tooltip">
                <dl className="sd-tip__list">
                  <div>
                    <dt>Skill</dt>
                    <dd>{row.topic}</dd>
                  </div>
                  <div>
                    <dt>Final Exam Performance</dt>
                    <dd>
                      {row.score}%
                      {row.total !== null ? ` (${row.correct} of ${row.total} correct)` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Target Competency</dt>
                    <dd>{cutoff}%</dd>
                  </div>
                  <div>
                    <dt>Skill Gap</dt>
                    <dd>
                      {row.gap > 0
                        ? `${row.gap} percentage ${row.gap === 1 ? "point" : "points"}`
                        : "None"}
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd className="sd-tip__band">{row.band.label}</dd>
                  </div>
                </dl>
              </span>
            </div>

            <span className="sd-skill__value">
              <span className="sd-skill__score">{row.score}%</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default SkillGapAnalysis;
