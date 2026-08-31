import { useMemo, useState } from "react";
import { SKILL_FORMULAS, TARGET, toScore } from "../performance";
import { ChevronDownIcon } from "./icons";

/**
 * The arithmetic behind the skill gap panel, shown on request.
 *
 * The chart above answers "where am I weak". This answers "how did you get
 * that number", which is a different question and a rarer one — so it is
 * folded away behind a pill rather than sitting open. It exists because the
 * figures are defended in a paper: every column here is a term in one of the
 * formulas, and the totals row is the proof that the weights sum to 1.
 *
 * Nothing is recomputed from scratch. `correct`, `total` and `weight` come
 * from the server, which is the only place the formulas live — a second
 * implementation here would be a second answer waiting to disagree.
 */
function RawComputation({ course }) {
  const [open, setOpen] = useState(false);

  const skills = course?.skills ?? [];

  const rows = useMemo(
    () =>
      skills
        .map((skill) => {
          const correct = Number(skill.correct) || 0;
          const asked = Number(skill.total) || 0;
          const score = toScore(skill.score);
          const weight = Number(skill.weight) || 0;

          return {
            key: skill.moduleId ?? skill.topic,
            topic: skill.topic,
            correct,
            asked,
            score,
            weight,
            // The term this topic contributes to the weighted figure.
            contribution: weight * score
          };
        }),
    [skills]
  );

  if (rows.length === 0) return null;

  const totalCorrect = Number(course.itemsCorrect) || rows.reduce((sum, r) => sum + r.correct, 0);
  const totalAsked = Number(course.itemsAsked) || rows.reduce((sum, r) => sum + r.asked, 0);
  const weightSum = rows.reduce((sum, r) => sum + r.weight, 0);
  const weighted = rows.reduce((sum, r) => sum + r.contribution, 0);
  const overall = totalAsked > 0 ? (totalCorrect / totalAsked) * 100 : 0;

  const decimals = (value, places = 3) =>
    Number.isFinite(value) ? value.toFixed(places) : "—";

  return (
    <section className="sd-card" aria-labelledby="sd-raw-title">
      <header className="sd-section-head">
        <div className="sd-section-head__text">
          <h2 className="sd-h3" id="sd-raw-title">
            Raw computation
          </h2>
        </div>

        <button
          type="button"
          className="sd-raw__toggle"
          aria-expanded={open}
          aria-controls="sd-raw-panel"
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDownIcon size={13} />
          {open ? "Hide raw computation" : "Show raw computation"}
        </button>
      </header>

      {open ? (
        <div id="sd-raw-panel">
          <div className="sd-raw__formulas">
            {SKILL_FORMULAS.map((formula) => (
              <p className="sd-raw__formula" key={formula.name}>
                <span className="sd-raw__formula-name">{formula.name}:</span>
                <code>{formula.expression}</code>
              </p>
            ))}
          </div>

          <div className="sd-table-wrap">
            <table className="sd-table sd-table--raw">
              <caption className="sd-sr-only">
                Per-topic working for this course, in lesson order
              </caption>
              <thead>
                <tr>
                  <th scope="col">Topic (i)</th>
                  <th scope="col" className="sd-table__num">
                    Correct (f<sub>i</sub>)
                  </th>
                  <th scope="col" className="sd-table__num">
                    Items asked
                  </th>
                  <th scope="col" className="sd-table__num">
                    Skill Score
                  </th>
                  <th scope="col" className="sd-table__num">
                    W<sub>i</sub>
                  </th>
                  <th scope="col" className="sd-table__num">
                    W<sub>i</sub> × Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} data-zero={row.correct === 0 ? "true" : undefined}>
                    <td>{row.topic}</td>
                    <td className="sd-table__num">{row.correct}</td>
                    <td className="sd-table__num">{row.asked}</td>
                    <td className="sd-table__num">{row.score}%</td>
                    <td className="sd-table__num">{decimals(row.weight)}</td>
                    <td className="sd-table__num">{decimals(row.contribution, 1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td className="sd-table__num">{totalCorrect}</td>
                  <td className="sd-table__num">{totalAsked}</td>
                  <td className="sd-table__num">{Math.round(overall)}%</td>
                  <td className="sd-table__num">{decimals(weightSum)}</td>
                  <td className="sd-table__num">{decimals(weighted, 1)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <dl className="sd-raw__results">
            <div className="sd-raw__result">
              <dt>Overall performance</dt>
              <dd>
                {totalCorrect} / {totalAsked} × 100 = <strong>{Math.round(overall)}%</strong>
              </dd>
            </div>
            <div className="sd-raw__result">
              <dt>Weighted score</dt>
              <dd>
                Σ(W<sub>i</sub> × Score<sub>i</sub>) = <strong>{Math.round(weighted)}%</strong>
              </dd>
            </div>
            <div className="sd-raw__result">
              <dt>Weak threshold</dt>
              <dd>
                Skill Score &lt; <strong>{TARGET}%</strong>
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}

export default RawComputation;
