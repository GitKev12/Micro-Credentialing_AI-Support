import Stepper from "./Stepper";
import { share } from "./levels";

/**
 * How many of the exam's questions come from each lesson.
 *
 * The percentage is shown beside the count because it is the figure an
 * assessor defends to a panel — "Arrays is an eighth of this examination" —
 * while the count is the figure they set. The bar behind each row is the same
 * number a third time and is there for the comparison the column cannot make:
 * which lessons are carrying the paper.
 *
 * Equal shares are one press away because that is the honest default and the
 * commonest answer, but it is a starting point rather than the rule — a lesson
 * with more in it may well deserve more of the paper.
 */
export default function ContentSplit({ lessons, counts, total, onChange, disabled }) {
  const most = Math.max(1, ...lessons.map((lesson) => counts[lesson.id] ?? 0));

  return (
    <div className="tos-content">
      <ul className="tos-rows">
        {lessons.map((lesson, index) => {
          const count = counts[lesson.id] ?? 0;

          return (
            <li className="tos-row" key={lesson.id}>
              <span className="tos-row__n">{index + 1}</span>
              <span className="tos-row__name">{lesson.title}</span>
              <span className="tos-row__meter" aria-hidden="true">
                <span style={{ width: `${(count / most) * 100}%` }} />
              </span>
              <span className="tos-row__pct">{share(count, total)}%</span>
              <Stepper
                value={count}
                label={`Questions from ${lesson.title}`}
                disabled={disabled}
                onChange={(next) => onChange(lesson.id, next)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
