/**
 * The single scoring scale for everything the student sees.
 *
 * Before this module the dashboard ran two different scales — course
 * performance banded at 90/75/60, skills at 80/60 — so a 78% course read
 * "Good" while a 78% skill read "Medium". One scale now covers both.
 *
 * TARGET is the passing mark, and it is what "gap" means everywhere in the UI.
 * 60% is TSU's passing percentage by memorandum, and it is the same figure the
 * server sets every paper's pass mark from (DEFAULT_PASS_RATIO). It used to be
 * 75 here, which meant the dashboard could call a topic failing that the exam
 * behind it had passed.
 *
 * Two bands, not three. The question a skill gap answers is which topics are
 * gaps, and that is a yes or no against the passing mark — a middle band
 * invited a third answer to a two-answer question. It also removes the tightest
 * colour pair: the remaining two are the status palette's good and critical,
 * far apart to normal vision and still separable under protanopia and
 * deuteranopia. Colour never travels alone here either: every band ships an
 * icon and a word.
 */
export const TARGET = 60;

export const BANDS = {
  strong: {
    id: "strong",
    label: "Strong",
    // Sentence completing "This topic is …" in tooltips and callouts.
    blurb: "at or above the passing mark",
    tone: "good"
  },
  weak: {
    id: "weak",
    label: "Weak",
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
  return toScore(value) >= TARGET ? BANDS.strong : BANDS.weak;
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
