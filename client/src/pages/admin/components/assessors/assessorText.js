import { formatDate, plural } from "../../lib/format";

/**
 * "Last posted 15 Aug 2026", or "Last graded 15 Aug 2026".
 *
 * Being assigned six courses says what an assessor was given. This says
 * whether they have done any of it — the question the screen is usually open
 * to answer.
 *
 * It named only grading, which was the whole job when marking was all an
 * assessor did here. Writing and posting a course's papers is now the bulk of
 * their console, and reporting only the other half said "has not graded
 * anything yet" about someone who had been working all week.
 */
export const ACTIVITY_LABELS = { posted: "Last posted", graded: "Last graded" };

/**
 * "16 days ago", "3 weeks ago", "5 months ago".
 *
 * Deliberately coarser than the assessor console's `timeAgo`, which falls back
 * to a bare date after a week: the date is already on this line, and what a
 * date alone does not answer is how long the account has been quiet — which is
 * the question an admin opens the screen with.
 */
export function agoLabel(value) {
  if (!value) return null;

  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return null;

  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  if (days < 31) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }

  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function lastActiveLabel(lastActive) {
  const when = formatDate(lastActive?.at);
  if (!when) return "Has not posted or graded anything yet";

  const label = `${ACTIVITY_LABELS[lastActive.kind] ?? "Last active"} ${when}`;
  const ago = agoLabel(lastActive.at);
  return ago ? `${label} · ${ago}` : label;
}

/** What the last thing they did was, for the row under the date. */
export function activityKindLabel(kind) {
  if (kind === "posted") return "posted an assessment";
  return kind === "graded" ? "released a grade" : null;
}

/**
 * "6 of 9 posted · 2 drafts written".
 *
 * The number still owed does not on its own separate an assessor who has never
 * opened the generator from one who has written every paper and posted all but
 * two, and those are different conversations.
 */
export function papersNote(workload) {
  if (!workload.papersExpected) return null;

  const posted = `${workload.papersPosted} of ${workload.papersExpected} posted`;
  if (!workload.papersDraft) return posted;

  const drafts =
    workload.papersDraft === 1 ? "1 draft written" : `${workload.papersDraft} drafts written`;
  return `${posted} · ${drafts}`;
}

/**
 * "9 assessments to post and 3 credentials to issue", either half dropped when
 * it is zero. Only ever read on a suspended account, where the work is the
 * consequence of the suspension rather than a workload figure.
 */
export function backlogPhrase(workload) {
  const parts = [];

  if (workload.toPost > 0) {
    parts.push(`${workload.toPost} assessment${workload.toPost === 1 ? "" : "s"} to post`);
  }
  if (workload.credentialsPending > 0) {
    const n = workload.credentialsPending;
    parts.push(`${n} credential${n === 1 ? "" : "s"} to issue`);
  }

  return parts.join(" and ");
}

// The three parts of the job, in the order the assessor's own rail runs them:
// write and post a course's papers, release the marks, issue the credentials.
export const EMPTY_WORKLOAD = {
  papersExpected: 0,
  papersPosted: 0,
  papersDraft: 0,
  toPost: 0,
  credentialsPending: 0,
  credentialsIssued: 0
};

/**
 * What deleting an assessor destroys, and what survives it.
 *
 * Almost everything survives, and saying so is the point. A mark they released
 * and a paper they posted are facts about a course and its students; neither
 * stops being true because the account that recorded it has gone. What is lost
 * is the account itself and their place on a staff list.
 */
export function assessorLosses(impact) {
  if (!impact) return null;
  if (impact.unknown) return ["their sign-in, and their place on any class they staff"];

  return [
    "their sign-in",
    impact.classes
      ? `their place on ${plural(impact.classes, "class", "es")} — the class stays, one assessor short`
      : ""
  ].filter(Boolean);
}

export function assessorKeeps(impact) {
  if (!impact || impact.unknown) return [];

  return [
    impact.graded
      ? `${plural(impact.graded, "released grade")} — the mark stands, and the student keeps it`
      : "",
    impact.assigned
      ? `${plural(impact.assigned, "course")} — its lessons and posted papers are untouched`
      : ""
  ].filter(Boolean);
}
