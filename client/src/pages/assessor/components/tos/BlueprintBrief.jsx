import { GROUPS, LEVELS, groupItems, share, splitItems } from "./levels";

/**
 * What the blueprint asks of the paper this screen is about to write.
 *
 * The generate screen sets a length by hand. The blueprint set one too, along
 * with the mix of thinking behind it, and until now the two never met: an
 * assessor could plan forty questions weighted to the higher orders and then
 * generate ten of whatever the model felt like. This card is where the plan
 * is visible at the moment it is being spent.
 *
 * It carries the same bar as the blueprint itself, at a smaller size and
 * without the running total — the total is the figure beside it, and the bar's
 * job here is the mix rather than the arithmetic. Under it, the only division
 * an assessor argues about in front of a panel: how much of this paper is
 * lower-order and how much is higher.
 */
export default function BlueprintBrief({ items, split, asked, paper, onModify }) {
  const assigned = splitItems(split);
  const scale = assigned || 1;

  return (
    <section className="assessor-card tos-brief">
      <h2 className="assessor-card-title">Table of Specification</h2>

      {assigned > 0 ? (
        <>
          <p className="tos-brief__total">
            {items}
            <span>question{items === 1 ? "" : "s"}</span>
          </p>

          <div
            className="tos-bar__track tos-bar__track--slim"
            role="img"
            aria-label={GROUPS.map(
              (group) =>
                `${group.name}: ${groupItems(split, group.key)} of ${assigned} questions.`
            ).join(" ")}
          >
            {LEVELS.map((level) => {
              const count = split?.[level.key] ?? 0;
              if (!count) return null;

              return (
                <span
                  key={level.key}
                  className="tos-bar__seg"
                  data-level={level.key}
                  style={{ width: `${(count / scale) * 100}%` }}
                  title={`${level.label}: ${count}`}
                />
              );
            })}
          </div>

          <ul className="tos-brief__groups">
            {GROUPS.map((group) => {
              const count = groupItems(split, group.key);

              return (
                <li className="tos-brief__group" key={group.key} data-group={group.key}>
                  <span className="tos-brief__label">{group.label}</span>
                  <span className="tos-brief__count">{count}</span>
                  <span className="tos-brief__pct">{share(count, assigned)}%</span>
                </li>
              );
            })}
          </ul>

          {/* The one thing worth catching before the money is spent: the field
              above is about to write a paper of a different length from the one
              that was planned.

              Said in the blueprint's own words for a sum that does not agree,
              rather than in the console's warning colour — which is a pale blue
              on the dark theme, and would leave the most useful line on the card
              the quietest thing on it. It is a state of the work either way: an
              assessor may well mean to write a longer paper than the plan. */}
          {asked !== items ? (
            <p className="tos-check">
              The field above is set to {asked}, not {items}.
            </p>
          ) : null}
        </>
      ) : (
        <p className="gen-hint">Nothing planned for this {paper} yet.</p>
      )}

      <div className="gen-actions">
        <button type="button" className="btn btn--ghost" onClick={onModify}>
          Modify TOS
        </button>
      </div>
    </section>
  );
}
