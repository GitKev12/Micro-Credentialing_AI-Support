import { isPosted } from "./assessments.format.js";

/**
 * How many papers a course owes, and how many of them are out.
 *
 * Both consoles ask this and both used to answer it themselves. The admin's
 * Assessors screen reports what each course is still waiting on; the assessor's
 * own rail badge and Classes register report the same thing from the inside.
 * Three copies of one sum, and they drifted exactly where you would expect: the
 * admin's copy asked `isPosted`, the assessor's two asked `status !== "draft"`,
 * and a document written before posting existed — which carries no status at
 * all — was a draft to one console and a posted paper to the other. The student
 * was refused a paper their assessor's screen said was live.
 *
 * So it is one function, here, next to the `isPosted` it turns on.
 *
 * Posted lessons are counted as a set rather than added up. Regenerating a
 * lesson's paper replaces it, and two documents for one lesson must not read as
 * two papers delivered — that would let a course report more posted than it has
 * lessons, and `toPost` would reach zero with lessons still uncovered.
 *
 * Kept separate from the query that feeds it so the arithmetic can be exercised
 * without a database.
 *
 * @param assessments  every Assessment for the courses in `lessonCounts`.
 * @param lessonCounts Map<courseId, lessons>. A course present here with no
 *                     assessments still gets a row, because a course nobody has
 *                     written a paper for is the one worth reporting.
 * @returns Map<courseId, { expected, posted, draft, toPost, finalPosted,
 *                          postedLessons, lastPosted }>
 */
export function papersByCourse(assessments, lessonCounts) {
  const asId = (value) => String(value);

  const toDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const papers = new Map();

  const rowFor = (courseKey) => {
    if (!papers.has(courseKey)) {
      papers.set(courseKey, {
        // One paper per lesson, plus the course's final.
        expected: (lessonCounts.get(courseKey) ?? 0) + 1,
        postedLessons: new Set(),
        finalPosted: false,
        draft: 0,
        lastPosted: null
      });
    }
    return papers.get(courseKey);
  };

  lessonCounts.forEach((_count, courseKey) => rowFor(courseKey));

  for (const doc of assessments) {
    const row = rowFor(asId(doc.courseId));

    // `isPosted` and nothing else. Only a paper an assessor posted counts, and
    // a document that never said so — including one written before releasing
    // existed — is a draft. It is what the student side reads, so it is what
    // decides here.
    if (!isPosted(doc)) {
      row.draft += 1;
      continue;
    }

    if (doc.scope === "final" || !doc.moduleId) row.finalPosted = true;
    else row.postedLessons.add(asId(doc.moduleId));

    const postedAt = toDate(doc.postedAt);
    if (postedAt && (!row.lastPosted || postedAt > row.lastPosted)) row.lastPosted = postedAt;
  }

  papers.forEach((row) => {
    row.posted = row.postedLessons.size + (row.finalPosted ? 1 : 0);
    row.written = row.posted + row.draft;
    row.toPost = Math.max(0, row.expected - row.posted);
  });

  return papers;
}
