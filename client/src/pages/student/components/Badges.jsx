import { CheckIcon } from "./icons";

/**
 * Milestones earned from work already on the record.
 *
 * A badge is not awarded by anyone — the server derives it from lessons read
 * and courses finished, which is why this section has something to show long
 * before the first certification exists. Locked badges stay visible with the
 * count that would unlock them, so the section reads as a map rather than a
 * trophy shelf; an empty grey tile would tell the student nothing.
 */

function formatDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Badge({ badge }) {
  const earnedOn = formatDate(badge.earnedAt);
  const target = badge.target || 1;
  const pct = Math.max(0, Math.min(100, Math.round((badge.current / target) * 100)));

  return (
    <li className="sd-badge" data-earned={badge.earned ? "yes" : "no"}>
      <span className="sd-badge__glyph" aria-hidden="true">
        {badge.icon}
      </span>

      <p className="sd-badge__name">{badge.name}</p>
      <p className="sd-badge__desc">{badge.description}</p>

      {badge.earned ? (
        <p className="sd-badge__state">
          <CheckIcon size={12} />
          {earnedOn ? `Earned ${earnedOn}` : "Earned"}
        </p>
      ) : (
        <div className="sd-badge__progress">
          <span className="sd-badge__track" aria-hidden="true">
            <span className="sd-badge__fill" style={{ width: `${pct}%` }} />
          </span>
          <span className="sd-badge__count">
            {badge.current} / {target}
          </span>
        </div>
      )}
    </li>
  );
}

function Badges({ badges = [] }) {
  const earned = badges.filter((badge) => badge.earned).length;

  return (
    <section className="sd-card" aria-labelledby="sd-badges-title">
      <header className="sd-section-head">
        <div className="sd-section-head__text">
          <p className="sd-eyebrow">Badges</p>
          <h2 className="sd-h3" id="sd-badges-title">
            Milestones
          </h2>
          <p className="sd-sub">
            {badges.length
              ? `${earned} of ${badges.length} earned from the lessons and courses you have finished.`
              : "Earned automatically as you work through your lessons."}
          </p>
        </div>
      </header>

      {badges.length === 0 ? (
        <p className="sd-sub">Your milestones appear here as you start reading lessons.</p>
      ) : (
        <ul className="sd-badges">
          {badges.map((badge) => (
            <Badge key={badge.id} badge={badge} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default Badges;
