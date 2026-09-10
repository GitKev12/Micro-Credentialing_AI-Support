import { LEVELS, splitItems } from "./levels";

/**
 * Where the paper stands: one bar, filled by level, with what is still
 * unassigned left open at the end.
 *
 * This is the only question the screen has to answer at a glance — is the
 * blueprint finished — and it is a shape rather than a sentence because the
 * answer is really two things at once: how much is left, and where what has
 * been spent went. A row of six figures says the first only by arithmetic.
 *
 * The open tail is drawn rather than left blank so that "nothing assigned yet"
 * and "no paper set" are different pictures. Over-assignment runs past the
 * mark in the critical colour: the bar cannot simply refuse the item, because
 * the assessor may be mid-way through moving one level's share to another.
 */
export default function AllocationBar({ target, split, unit = "question" }) {
  const assigned = splitItems(split);
  const scale = Math.max(target, assigned) || 1;
  const left = Math.max(0, target - assigned);
  const over = Math.max(0, assigned - target);

  const status = over
    ? `${over} too many`
    : left
      ? `${left} still to assign`
      : target > 0
        ? "Fully assigned"
        : "Set a length to begin";

  return (
    <div className={`tos-bar${over ? " is-over" : left === 0 && target > 0 ? " is-done" : ""}`}>
      <p className="tos-bar__head">
        <span className="tos-bar__count">
          {target}
          <span className="tos-bar__unit">
            {" "}
            {unit}
            {target === 1 ? "" : "s"}
          </span>
        </span>
        <span className="tos-bar__status">{status}</span>
      </p>

      <div
        className="tos-bar__track"
        role="img"
        aria-label={`${assigned} of ${target} ${unit}s assigned. ${status}.`}
      >
        {LEVELS.map((level) => {
          const count = split?.[level.key] ?? 0;
          if (!count) return null;
          const width = (count / scale) * 100;

          return (
            <span
              key={level.key}
              className="tos-bar__seg"
              data-level={level.key}
              style={{ width: `${width}%` }}
              title={`${level.label}: ${count}`}
            >
              {/* Below about a fourteenth of the bar there is no room for a
                  figure, and a clipped digit reads as a different number. */}
              {width >= 7 ? <span className="tos-bar__seg-n">{count}</span> : null}
            </span>
          );
        })}

        {left ? (
          <span className="tos-bar__open" style={{ width: `${(left / scale) * 100}%` }} />
        ) : null}
      </div>
    </div>
  );
}
