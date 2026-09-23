import { plural } from "../../lib/format";

/**
 * The sections a class may be, and the list the form offers.
 *
 * A section is one of a short fixed set, so it is picked rather than typed.
 * Typed, the same room arrived as "Sec A", "section a" and "CC2-A" — three
 * spellings of one thing, which sort as three and read as three.
 *
 * It is optional. A course taught to a single cohort has no sections to tell
 * apart, and making that class invent a name is ceremony. The empty option is
 * how it is left unset — offered in the list rather than left as a placeholder,
 * so having no section reads as an answer instead of an unfilled field.
 * `classTitle` is what such a class is called wherever it is listed.
 */
export const SECTIONS = ["Section-A", "Section-B", "Section-C", "Section-D"];

export const sectionOptions = [
  { value: "", label: "No section" },
  ...SECTIONS.map((section) => ({ value: section, label: section }))
];

/**
 * What a class is called wherever it is listed rather than edited.
 *
 * The name is optional, so it is not always what the class is called. One
 * without a section falls back to its course code — which is what it is, and
 * what the column beside it says anyway — rather than rendering a blank cell
 * that reads as a row which failed to load.
 */
export function classTitle(cls) {
  const name = String(cls?.name ?? "").trim();
  if (name) return name;
  return cls?.course?.code || cls?.course?.title || "Unnamed class";
}

/** The schedule as one line — "MWF · 09:00–10:00 · Lab 201", or nothing. */
export function scheduleSummary(schedule) {
  const parts = [schedule?.days, schedule?.time, schedule?.room]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return parts.join(" · ");
}

/**
 * What deleting a class changes. It destroys the class row and nothing else —
 * no account, no completion. What it *changes* is enrolment: the people no other
 * class still holds on this course are unenrolled or unassigned, and that is the
 * half worth spelling out, since "delete" on its own reads like it removes them.
 */
export function classLosses(impact) {
  if (!impact) return null;
  if (impact.unknown) return ["this class and its schedule"];
  return ["this class, its roster tags and schedule"];
}

export function classKeeps(impact) {
  if (!impact || impact.unknown) return [];
  return [
    impact.unenroll
      ? `${plural(impact.unenroll, "student")} — unenrolled from the course, account and records stay`
      : "",
    impact.unassign
      ? `${plural(impact.unassign, "assessor")} — unassigned from the course, account stays`
      : ""
  ].filter(Boolean);
}

/**
 * What switching a class's pathway costs, in the figures the server counted.
 *
 * Both directions take something that cannot be handed back, and neither shows
 * up as a deleted record — which is exactly why it has to be spelled out. A
 * class going assess-only strands the badges its candidates have earned: the
 * submissions stay, but the pathway those badges were progress towards is no
 * longer the one they are on. A class going back to taught re-locks the
 * examination behind every lesson and every quiz, including for anyone who has
 * it open right now.
 */
export function pathwayLosses(impact) {
  if (!impact) return null;
  if (impact.unknown) return ["what this class's candidates have done so far"];

  const toAssessOnly = impact.to === "assessOnly";

  const lines = toAssessOnly
    ? [
        // The lessons close with the switch. Its candidates are examined on
        // competence they already hold, and the course material is the taught
        // section's — so they are refused it, not merely ungated by it.
        "the lessons — closed to this class, not just no longer a gate",
        impact.badges
          ? `${plural(impact.badges, "badge")} held by ${plural(
              impact.badgeHolders,
              "candidate"
            )} — no longer part of this pathway`
          : "",
        impact.quizzes
          ? `${plural(impact.quizzes, "lesson quiz", "zes")} — no longer taken by this class`
          : ""
      ]
    : [
        `the examination re-locks behind every lesson and quiz for ${plural(
          impact.students,
          "candidate"
        )}`,
        impact.finalsTaken
          ? `already taken by ${plural(impact.finalsTaken, "candidate")}`
          : ""
      ];

  return lines.filter(Boolean);
}

/** What the switch leaves alone — the half that reads as destroyed and is not. */
export function pathwayKeeps(impact) {
  if (!impact || impact.unknown) return [];
  return [
    "every submission and mark on record",
    "the roster — nobody is enrolled or unenrolled by this",
    impact.to === "assessOnly"
      ? "the lessons themselves — nothing is deleted, the class simply loses access"
      : "the examination already written for this class"
  ];
}
