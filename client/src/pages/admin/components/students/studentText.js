import { formatDate, plural } from "../../lib/format";

/**
 * "Last active 15 Aug 2026 · submitted a quiz".
 *
 * Enrolment only says a student was signed up. This says whether they have
 * turned up since, which is the question this screen is usually open to answer.
 */
export function lastActiveLabel(lastActive) {
  const when = formatDate(lastActive?.at);
  if (!when) return "No activity recorded yet";

  return `Last active ${when} · ${
    lastActive.kind === "quiz" ? "submitted a quiz" : "finished a lesson"
  }`;
}

/** "Latest: Binary Search Trees · Aug 20, 2026" — for a tile that counts them. */
export function latestLine(name, at) {
  const when = formatDate(at);
  return `Latest: ${name}${when ? ` · ${when}` : ""}`;
}

/**
 * One row per enrolled course, carrying everything the record says about that
 * course: how far through it the student is, how many of its badges they hold,
 * and who assesses it.
 *
 * These arrived as four separate lists because they were four separate cards.
 * They are one table now, so they are joined back together here — on course id,
 * which every one of them carries, rather than on the course title they happen
 * to print.
 */
export function courseRows(enrolled, progress, badges, assessors) {
  const progressBy = new Map(progress.map((row) => [String(row.courseId ?? ""), row]));

  // Badges key on the course they belong to, but a badge written before its
  // course had an id keys on the code instead, so both are looked up.
  const badgesById = new Map(badges.map((row) => [String(row.courseId ?? ""), row]));
  const badgesByCode = new Map(badges.map((row) => [String(row.code ?? ""), row]));

  // Assessors arrive per assessor, listing the courses they cover; the table
  // reads the other way round.
  const assessorsByCourse = new Map();
  assessors.forEach((assessor) => {
    (assessor.courses ?? []).forEach((course) => {
      const key = String(course.id ?? "");
      if (!assessorsByCourse.has(key)) assessorsByCourse.set(key, []);
      assessorsByCourse.get(key).push(assessor.name);
    });
  });

  return enrolled.map((course) => ({
    ...course,
    progress: progressBy.get(String(course.id)) ?? null,
    badges: badgesById.get(String(course.id)) ?? badgesByCode.get(String(course.code)) ?? null,
    assessors: assessorsByCourse.get(String(course.id)) ?? []
  }));
}

/**
 * What deleting a student destroys, and what survives it.
 *
 * The split is the point of the dialog. Their own record goes — the answers
 * they gave, the lessons they finished, the certificates they hold. The
 * courses and classes do not: those belong to the institution, and a roster
 * simply gets shorter.
 */
export function studentLosses(impact) {
  if (!impact) return null;
  if (impact.unknown) {
    return [
      "their quiz submissions and the marks on them",
      "their lesson completions",
      "any certificate they have been issued"
    ];
  }

  return [
    impact.submissions ? plural(impact.submissions, "quiz submission") : "",
    impact.completions ? plural(impact.completions, "lesson completion") : "",
    impact.certificates ? plural(impact.certificates, "issued certificate") : ""
  ].filter(Boolean);
}

export function studentKeeps(impact) {
  if (!impact || impact.unknown) return [];

  return [
    impact.classes
      ? `${plural(impact.classes, "class")} — the class stays, its roster is one shorter`
      : "",
    impact.enrolled
      ? `${plural(impact.enrolled, "course")} — the course and its lessons are untouched`
      : ""
  ].filter(Boolean);
}
