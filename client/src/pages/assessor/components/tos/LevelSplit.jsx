import Stepper from "./Stepper";
import { GROUPS, groupItems, levelsIn, share, splitItems } from "./levels";

/**
 * How the paper divides across the six levels of thinking.
 *
 * Laid out as the two groups side by side, because that is the order the
 * decision is actually made in: an assessor settles the lower/higher balance
 * first and only then splits each share three ways. Each group carries its own
 * running total and percentage, which is the figure being aimed at — "40% of
 * this paper is recall" is the sentence a blueprint is defending, and it is
 * not readable off six separate counts.
 */
export default function LevelSplit({ split, total, onChange, disabled = false }) {
  // Of the paper, not of what has been placed so far. "40% of this exam is
  // recall" is the sentence a blueprint defends, and it is a fixed target the
  // assessor is aiming at; measuring each group against the running total
  // instead makes it a figure that moves every time another item is set, and
  // reads 100% the moment the first level is given anything.
  const whole = total || splitItems(split);

  return (
    <div className="tos-groups">
      {GROUPS.map((group) => {
        const items = groupItems(split, group.key);

        return (
          <section className="tos-group" key={group.key} data-group={group.key}>
            <header className="tos-group__head">
              <h3 className="tos-group__name">
                {group.label}
                <span className="tos-group__expand">{group.name}</span>
              </h3>
              <p className="tos-group__tally">
                <strong>{items}</strong>
                <span>{share(items, whole)}%</span>
              </p>
            </header>

            <ul className="tos-levels">
              {levelsIn(group.key).map((level) => (
                <li className="tos-level" key={level.key}>
                  <span className="tos-level__swatch" data-level={level.key} aria-hidden="true" />
                  <span className="tos-level__name">{level.label}</span>
                  <Stepper
                    value={split?.[level.key] ?? 0}
                    label={level.label}
                    disabled={disabled}
                    onChange={(next) => onChange(level.key, next)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
