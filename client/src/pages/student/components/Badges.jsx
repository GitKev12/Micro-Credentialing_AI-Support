import { useMemo, useState } from "react";
import { ArrowIcon, BackIcon, CheckIcon } from "./icons";

/**
 * The badge wall, entered one course at a time.
 *
 * Nothing here is invented by the screen. The server serves the Badge catalog
 * — a badge for every lesson, titled with that lesson's name and drawn in its
 * own course's artwork — and marks the ones this student has earned. A badge
 * is earned by passing that lesson's quiz.
 *
 * The catalog runs to dozens of badges across a student's courses, which is
 * more than one grid can say anything with. So the front of the screen is one
 * card per course — its artwork, its code and name, and how many badges it
 * holds — and the badges themselves live one click inside. Unearned badges
 * stay on the wall, greyed, with what they ask for written underneath: the
 * grid is a map of the course, not a trophy shelf, and the state is never
 * colour alone.
 */

function formatDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Course artwork when the catalog carries it, the old emoji glyph otherwise. */
function BadgeArt({ badge }) {
  const isImage = badge.icon && (badge.iconType === "svg" || badge.icon.startsWith("data:"));

  return (
    <span
      className={`sd-badge__glyph${isImage ? " sd-badge__glyph--art" : ""}`}
      aria-hidden="true"
    >
      {isImage ? <img className="sd-badge__art" src={badge.icon} alt="" /> : badge.icon || "🏅"}
    </span>
  );
}

function Badge({ badge }) {
  const earnedOn = formatDate(badge.earnedAt);

  return (
    <li className="sd-badge" data-earned={badge.earned ? "yes" : "no"}>
      <BadgeArt badge={badge} />

      {badge.order ? <p className="sd-badge__lesson">Lesson {badge.order}</p> : null}
      <p className="sd-badge__name">{badge.name}</p>

      {badge.earned ? (
        <p className="sd-badge__state">
          <CheckIcon size={12} />
          {earnedOn ? `Earned ${earnedOn}` : "Earned"}
        </p>
      ) : (
        <p className="sd-badge__state sd-badge__state--locked">Pass this lesson&apos;s quiz</p>
      )}
    </li>
  );
}

/** One course, as a card: its artwork, what it is, and how many badges it holds. */
function CourseCard({ group, onOpen }) {
  const total = group.badges.length;

  return (
    <li className="sd-badge-course">
      <button
        type="button"
        className="sd-badge-course__open"
        onClick={onOpen}
        aria-label={`${group.title || group.code} — ${total} badges, ${group.earned} earned`}
      >
        {group.icon ? (
          <span className="sd-badge-course__art" aria-hidden="true">
            <img src={group.icon} alt="" />
          </span>
        ) : null}

        <span className="sd-badge-course__text">
          {group.code ? <span className="sd-eyebrow">{group.code}</span> : null}
          <span className="sd-badge-course__title">{group.title || "Course"}</span>
          <span className="sd-badge-course__count">
            <strong>{total}</strong> {total === 1 ? "badge" : "badges"} · {group.earned} earned
          </span>
        </span>

        <span className="sd-badge-course__chevron" aria-hidden="true">
          <ArrowIcon size={16} />
        </span>
      </button>
    </li>
  );
}

/** Badges in the order the server sent them, split into their courses. */
function groupByCourse(badges) {
  const groups = new Map();

  for (const badge of badges) {
    const key = badge.courseId || badge.courseCode || "unassigned";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        code: badge.courseCode,
        title: badge.courseTitle,
        // Every badge in a course carries the same artwork; the first one
        // stands for the set.
        icon: badge.iconType === "svg" || String(badge.icon).startsWith("data:") ? badge.icon : null,
        badges: []
      });
    }
    groups.get(key).badges.push(badge);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    earned: group.badges.filter((badge) => badge.earned).length
  }));
}

function Badges({ badges = [] }) {
  const groups = useMemo(() => groupByCourse(badges), [badges]);
  const [openCourse, setOpenCourse] = useState(null);

  const selected = groups.find((group) => group.key === openCourse) ?? null;
  const earned = badges.filter((badge) => badge.earned).length;

  return (
    <section className="sd-card" aria-labelledby="sd-badges-title">
      <header className="sd-section-head">
        <div className="sd-section-head__text">
          <h2 className="sd-h3" id="sd-badges-title">
            Lesson Badges
          </h2>
          {badges.length ? (
            <p className="sd-sub">{`${earned} of ${badges.length} earned`}</p>
          ) : null}
        </div>
      </header>

      {groups.length === 0 ? (
        <p className="sd-sub">No badges yet.</p>
      ) : selected ? (
        <>
          <div className="sd-breadcrumb sd-badge-back">
            <button
              type="button"
              className="sd-btn sd-btn--sm"
              onClick={() => setOpenCourse(null)}
            >
              <BackIcon size={15} />
              All courses
            </button>
          </div>

          <div className="sd-badge-group__head">
            <div>
              {selected.code ? <p className="sd-eyebrow">{selected.code}</p> : null}
              <h3 className="sd-badge-group__title">{selected.title || "Course"}</h3>
            </div>
            <p className="sd-badge-group__count">
              {selected.earned} of {selected.badges.length} earned
            </p>
          </div>

          <ul className="sd-badges">
            {selected.badges.map((badge) => (
              <Badge key={badge.id} badge={badge} />
            ))}
          </ul>
        </>
      ) : (
        <ul className="sd-badge-courses">
          {groups.map((group) => (
            <CourseCard
              key={group.key}
              group={group}
              onOpen={() => setOpenCourse(group.key)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default Badges;
