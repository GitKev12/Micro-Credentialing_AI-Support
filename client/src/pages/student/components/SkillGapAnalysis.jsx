import { useMemo, useState } from "react";
import { BANDS, TARGET, bandFor, gapToTarget, toScore } from "../performance";
import { BandIcon, ChartIcon, TableIcon } from "./icons";
import { BandChip, Meter, TargetLegend } from "./ui";

const VIEWS = [
  { id: "chart", label: "Chart", Icon: ChartIcon },
  { id: "table", label: "Table", Icon: TableIcon }
];

const LEGEND = [BANDS.strong, BANDS.weak];

/**
 * Per-topic scores for one course.
 *
 * Sorted weakest-first, because the question this panel answers is "where is
 * my gap", not "what is my alphabetical list of topics". One measure, banded
 * by the reserved status palette; the band legend is always on screen, every
 * bar prints its own value, and the table view carries the same numbers for
 * anyone the colour does not reach.
 */
function SkillGapAnalysis({ skills = [] }) {
  const [view, setView] = useState("chart");

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
            band: bandFor(score),
            gap: gapToTarget(score),
            // How the score was arrived at: correct out of the items the final
            // asked of this lesson. Absent on anything not scored that way.
            correct: Number.isFinite(skill.correct) ? skill.correct : null,
            total: Number.isFinite(skill.total) ? skill.total : null
          };
        })
        .sort((a, b) => a.score - b.score),
    [skills]
  );

  const showItems = rows.some((row) => row.total !== null);

  const belowTarget = rows.filter((row) => row.gap > 0);
  const focus = rows[0];

  if (rows.length === 0) {
    return (
      <section className="sd-card">
        <h2 className="sd-h3">Skill gap analysis</h2>
        <p className="sd-sub">
          No topic scores for this course yet. They appear here once you have sat the
          final exam, which is what measures every lesson at once.
        </p>
      </section>
    );
  }

  return (
    <section className="sd-card" aria-labelledby="sd-skills-title">
      <header className="sd-section-head">
        <div className="sd-section-head__text">
          <p className="sd-eyebrow">Weakest first</p>
          <h2 className="sd-h3" id="sd-skills-title">
            Skill gap analysis
          </h2>
          <p className="sd-sub">
            {belowTarget.length === 0
              ? `Every topic sits at or above the ${TARGET}% passing mark.`
              : `${belowTarget.length} of ${rows.length} ${
                  rows.length === 1 ? "topic is" : "topics are"
                } weak — under the ${TARGET}% passing mark.`}
          </p>
        </div>

        <div className="sd-segmented" role="group" aria-label="Skill data view">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="sd-segmented__btn"
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
            >
              <option.Icon />
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {view === "chart" ? (
        <>
          <div className="sd-skills__legend">
            {LEGEND.map((band) => (
              <span className="sd-skills__legend-item" key={band.id} data-band={band.id}>
                <span className="sd-skills__legend-swatch" aria-hidden="true" />
                <BandIcon band={band.id} size={13} />
                {band.label}
              </span>
            ))}
            <TargetLegend />
          </div>

          <ul className="sd-skills__list">
            {rows.map((row) => (
              <li className="sd-skill" key={row.key} data-band={row.band.id}>
                <span className="sd-skill__topic">{row.topic}</span>

                <div className="sd-skill__plot">
                  <Meter
                    value={row.score}
                    band={row.band}
                    label={`${row.topic}: ${row.score} percent, ${row.band.label}`}
                  />
                  <span className="sd-tip" role="tooltip">
                    <strong>{row.topic}</strong>
                    {row.score}% · <span className="sd-tip__band">{row.band.label}</span>
                    <br />
                    {row.total !== null
                      ? `${row.correct} of ${row.total} ${
                          row.total === 1 ? "question" : "questions"
                        } correct · `
                      : ""}
                    {row.gap > 0
                      ? `${row.gap} points below the passing mark`
                      : `${row.score - TARGET} points above the passing mark`}
                  </span>
                </div>

                <span className="sd-skill__value">
                  <span className="sd-skill__score">{row.score}%</span>
                  <BandChip band={row.band} />
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="sd-table-wrap">
          <table className="sd-table">
            <caption className="sd-sr-only">
              Topic scores for this course, weakest first
            </caption>
            <thead>
              <tr>
                <th scope="col">Topic</th>
                {showItems ? (
                  <th scope="col" className="sd-table__num">
                    Correct
                  </th>
                ) : null}
                <th scope="col" className="sd-table__num">
                  Score
                </th>
                <th scope="col">Level</th>
                <th scope="col" className="sd-table__num">
                  Gap to {TARGET}%
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.topic}</td>
                  {showItems ? (
                    <td className="sd-table__num">
                      {row.total !== null ? `${row.correct} / ${row.total}` : "—"}
                    </td>
                  ) : null}
                  <td className="sd-table__num">{row.score}%</td>
                  <td>
                    <BandChip band={row.band} />
                  </td>
                  <td className="sd-table__num">{row.gap > 0 ? `${row.gap}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {focus && focus.gap > 0 ? (
        <div className="sd-callout" data-band={focus.band.id}>
          <span className="sd-callout__icon">
            <BandIcon band={focus.band.id} size={18} />
          </span>
          <p className="sd-callout__body">
            Start with <strong>{focus.topic}</strong> — at {focus.score}% it is your lowest
            topic and sits {focus.gap} {focus.gap === 1 ? "point" : "points"} under the{" "}
            {TARGET}% passing mark. Closing this one gap moves your course score more than
            any other.
          </p>
        </div>
      ) : (
        <div className="sd-callout" data-band={BANDS.strong.id}>
          <span className="sd-callout__icon">
            <BandIcon band={BANDS.strong.id} size={18} />
          </span>
          <p className="sd-callout__body">
            Every topic in this course is at or above the passing mark. Your weakest is{" "}
            <strong>{focus.topic}</strong> at {focus.score}% — the one to keep an eye on.
          </p>
        </div>
      )}
    </section>
  );
}

export default SkillGapAnalysis;
