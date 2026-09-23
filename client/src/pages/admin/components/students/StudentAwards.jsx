import { CoursesIcon, CredentialIcon } from "../icons";
import { AdminModal } from "../ui";
import { formatDate } from "../../lib/format";
import ProgressCell from "./ProgressCell";

/** Course artwork when the catalog carries it, the old emoji glyph otherwise. */
function BadgeArt({ badge }) {
  const isImage =
    badge.icon && (badge.iconType === "svg" || String(badge.icon).startsWith("data:"));

  return (
    <span className="admin-award__art" aria-hidden="true">
      {isImage ? <img src={badge.icon} alt="" /> : badge.icon || "🏅"}
    </span>
  );
}

/**
 * The badges, one group per course, in lesson order. A course's badges are
 * shown whether earned or not, so the gap is as readable as the haul.
 */
function badgeGroups(list) {
  const groups = new Map();
  list.forEach((badge) => {
    const key = badge.courseId || badge.courseCode || "unassigned";
    if (!groups.has(key)) {
      groups.set(key, { key, title: badge.courseTitle, code: badge.courseCode, badges: [] });
    }
    groups.get(key).badges.push(badge);
  });

  return [...groups.values()].map((group) => ({
    ...group,
    badges: group.badges.sort((a, b) => a.order - b.order),
    earned: group.badges.filter((badge) => badge.earned).length
  }));
}

function BadgesBody({ badges }) {
  const groups = badgeGroups(badges.list ?? []);
  if (groups.length === 0) {
    return <p className="admin-empty-note">No badges in this student&apos;s courses yet.</p>;
  }

  return groups.map((group) => (
    <section className="admin-award-group" key={group.key}>
      <h3 className="admin-award-group__head">
        <span className="admin-award-group__title">{group.title || group.code}</span>
        <span className="admin-award-group__count">
          {group.earned} of {group.badges.length}
        </span>
      </h3>
      <ul className="admin-award-grid">
        {group.badges.map((badge) => (
          <li className="admin-award" data-earned={badge.earned ? "yes" : "no"} key={badge.id}>
            <BadgeArt badge={badge} />
            <span className="admin-award__name">{badge.name}</span>
            <span className="admin-award__when">
              {badge.earned ? formatDate(badge.earnedAt) ?? "Earned" : "Not yet"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  ));
}

/**
 * A micro-credential is a course carried to the end, so the list is the
 * enrolled courses: the finished ones first, then how far along the rest are.
 */
function CredentialsBody({ rows }) {
  if (rows.length === 0) {
    return <p className="admin-empty-note">Not enrolled in any course yet.</p>;
  }

  const done = (row) => row.progress && row.progress.total > 0 && row.progress.pct === 100;
  const sorted = [...rows].sort((a, b) => Number(done(b)) - Number(done(a)));

  return (
    <ul className="admin-cred-list">
      {sorted.map((row) => {
        const earned = done(row);
        return (
          <li className="admin-cred" data-earned={earned ? "yes" : "no"} key={row.id}>
            <span className="admin-cred__mark" aria-hidden="true">
              <CredentialIcon size={20} />
            </span>
            <span className="admin-cred__course">
              <span className="admin-cred__title">{row.title}</span>
              <span className="admin-cred__code">{row.code}</span>
            </span>
            <span className="admin-cred__state">
              {earned
                ? `Earned ${formatDate(row.progress.completedAt) ?? ""}`.trim()
                : `${row.progress?.pct ?? 0}% through`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The courses the student is enrolled in, with how far along each one is. */
function CoursesBody({ rows }) {
  if (rows.length === 0) {
    return <p className="admin-empty-note">Not enrolled in any course yet.</p>;
  }

  return (
    <ul className="admin-cred-list">
      {rows.map((row) => (
        <li className="admin-cred admin-cred--course" key={row.id}>
          <span className="admin-cred__mark" aria-hidden="true">
            <CoursesIcon size={20} />
          </span>
          <span className="admin-cred__course">
            <span className="admin-cred__title">{row.title}</span>
            <span className="admin-cred__code">{row.code}</span>
            <span className="admin-cred__code">
              {row.assessors.length > 0
                ? `Assessor: ${row.assessors.join(", ")}`
                : "No assessor yet"}
            </span>
          </span>
          <span className="admin-cred__progress">
            <ProgressCell progress={row.progress} />
          </span>
        </li>
      ))}
    </ul>
  );
}

const TITLES = { badges: "Badges", credentials: "Micro-credentials", courses: "Active courses" };

/** The list behind one of a student's tiles, opened over the page. */
export default function StudentAwards({ kind, student, badges, rows, onClose }) {

  return (
    <AdminModal
      title={TITLES[kind]}
      subtitle={student.name}
      tone="admin-modal__panel--awards"
      onClose={onClose}
    >
      {kind === "badges" ? (
        <BadgesBody badges={badges} />
      ) : kind === "courses" ? (
        <CoursesBody rows={rows} />
      ) : (
        <CredentialsBody rows={rows} />
      )}
    </AdminModal>
  );
}
