/**
 * The single scoring scale for everything the student sees.
 *
 * Before this module the dashboard ran two different scales — course
 * performance banded at 90/75/60, skills at 80/60 — so a 78% course read
 * "Good" while a 78% skill read "Medium". One scale now covers both.
 *
 * Three bands, not four. The band colours are the reserved status palette
 * (good / warning / critical) and adjacent bands have to be tellable apart:
 * a fourth band would have put the palette's yellow beside its orange, a pair
 * that measures ΔE 13.6 to normal vision — under the 15 floor. Dropping to
 * three puts the worst adjacent pair at ΔE 27.6 (11.3 simulated for protanopia
 * and deuteranopia), clear of every gate. Colour never travels alone here
 * either: every band ships an icon and a word.
 *
 * TARGET is the passing mark, and it is what "gap" means everywhere in the UI.
 */
export const TARGET = 75;

export const BANDS = {
  strong: {
    id: "strong",
    label: "Strong",
    // Sentence completing "This topic is …" in tooltips and callouts.
    blurb: "at or above mastery",
    tone: "good"
  },
  developing: {
    id: "developing",
    label: "Developing",
    blurb: "passing, with room to grow",
    tone: "warn"
  },
  focus: {
    id: "focus",
    label: "Needs focus",
    blurb: "below the passing mark",
    tone: "crit"
  }
};

/** Clamp anything the API hands us into a whole 0–100. */
export function toScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function bandFor(value) {
  const score = toScore(value);
  if (score >= 85) return BANDS.strong;
  if (score >= TARGET) return BANDS.developing;
  return BANDS.focus;
}

/** Points still needed to reach the passing mark; 0 once there. */
export function gapToTarget(value) {
  return Math.max(0, TARGET - toScore(value));
}

export function averageScore(values) {
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => sum + toScore(value), 0);
  return Math.round(total / values.length);
}

/**
 * Every skill across every course, weakest first, tagged with its course so
 * the dashboard-level focus list can say where each gap lives.
 */
export function collectSkills(courses) {
  return courses
    .flatMap((course) =>
      (course.skills ?? []).map((skill) => ({
        key: `${course.id}:${skill.topic}`,
        topic: skill.topic,
        score: toScore(skill.score),
        courseId: course.id,
        courseTitle: course.title
      }))
    )
    .sort((a, b) => a.score - b.score);
}
