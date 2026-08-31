import { fileSizeLabel, listWords, plural } from "../../lib/format";

/**
 * What a deletion on the course screen would cost, in words.
 *
 * Kept apart from the screen because these are the sentences a confirm dialog
 * is answered on. They are the part worth reading on their own, and the part
 * worth being able to test without rendering a page around them.
 */

export function moduleMeta(module) {
  return [module.fileName, fileSizeLabel(module.fileSize)].filter(Boolean).join(" · ");
}

/**
 * What deleting a course destroys, and what survives it.
 *
 * The distinction is the point of the dialog: lessons and submissions go, but a
 * student is not the course's to delete — they are unenrolled and keep their
 * account. Saying only the first half would make this look like it removes
 * people.
 */
export function courseLosses(impact) {
  if (!impact) return null;
  if (impact.unknown) {
    return [
      "its lessons, with their files and quizzes",
      "any completions and submissions recorded in it",
      "its Table of Specification blueprint"
    ];
  }

  return [
    impact.modules ? `${plural(impact.modules, "lesson")}, with their files and quizzes` : "",
    impact.completions ? plural(impact.completions, "lesson completion") : "",
    impact.submissions ? plural(impact.submissions, "quiz submission") : "",
    impact.blueprints ? "its Table of Specification blueprint" : ""
  ].filter(Boolean);
}

export function courseKeeps(impact) {
  if (!impact || impact.unknown) return [];

  return [
    impact.enrolled
      ? `${plural(impact.enrolled, "student")} — unenrolled, but their account and records stay`
      : "",
    impact.assessors
      ? `${plural(impact.assessors, "assessor")} — unassigned, but their account stays`
      : ""
  ].filter(Boolean);
}

/**
 * What removing this lesson would destroy, named before the admin agrees to it.
 *
 * The confirm used to say "this module and its quiz". Deleting a module also
 * deletes every completion recorded against it — a student's evidence that they
 * did the work — and that was reported afterwards, in the success message.
 * Being told after the fact is not consent, so the counts are read first and
 * spelled out here.
 */
export function impactLabel(impact) {
  if (!impact) return "Checking what this would remove…";
  // The count failed. Name the categories anyway: silence would read as
  // "nothing else will be lost", which is the one thing we cannot claim.
  if (impact.unknown) return "Remove this module, its quiz and any completion records?";

  const losses = [
    impact.assessments ? `${impact.assessments} quiz${impact.assessments === 1 ? "" : "zes"}` : "",
    impact.completions
      ? `${impact.completions} completion record${impact.completions === 1 ? "" : "s"}`
      : "",
    impact.figures ? `${impact.figures} figure${impact.figures === 1 ? "" : "s"}` : ""
  ].filter(Boolean);

  if (losses.length === 0) return "Remove this module? Nothing else depends on it.";
  return `Remove this module, ${listWords(losses)}? This cannot be undone.`;
}

/**
 * Two letters standing in for a course, taken from its code where there is
 * one. Every card used to open with the same solid maroon band, which meant a
 * quarter of the card was spent on a colour that told you nothing and looked
 * identical on all of them; a mark built from the course's own code does the
 * wayfinding that band was pretending to do.
 */
export function courseMark(course) {
  const fromCode = (course.code ?? "").replace(/[^A-Za-z]/g, "");
  if (fromCode) return fromCode.slice(0, 2).toUpperCase();

  const words = (course.title ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}
