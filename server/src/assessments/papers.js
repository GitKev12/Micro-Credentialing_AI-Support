import { isPosted } from "./assessments.format.js";
import { papersForClass } from "./classPapers.js";

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
 * Counted per class, because a paper is written for one. A course taught
 * through Section A and Section B owes each of them a paper per lesson and a
 * final: nine lessons across two classes is twenty papers, not ten. Counting it
 * per course instead let one assessor's work cover the other's class — the
 * register said nothing was owed while a section had nothing posted at all.
 *
 * What a class holds is `papersForClass`: its own paper for a lesson, the
 * course's where it has none, another class's never. The same rule the student
 * side reads, so a class cannot be counted a paper its students are refused.
 *
 * Posted lessons are counted as a set rather than added up. Regenerating a
 * lesson's paper replaces it, and two documents for one lesson must not read as
 * two papers delivered — that would let a course report more posted than it has
 * lessons, and `toPost` would reach zero with lessons still uncovered.
 *
 * An assess-only class owes one paper, not one per lesson and a final: its
 * candidates take a single examination. Counting it the taught way reported a
 * class with its whole job done as one paper out of nine.
 *
 * Kept separate from the query that feeds it so the arithmetic can be exercised
 * without a database.
 *
 * @param assessments  every Assessment for the courses in `lessonCounts`.
 * @param lessonCounts Map<courseId, lessons>. A course present here with no
 *                     assessments still gets a row, because a course nobody has
 *                     written a paper for is the one worth reporting.
 * @param classIds     Map<courseId, classId[]>: the classes to count it for.
 *                     Whose classes decides whose sum it is — the admin passes
 *                     every class on the course, an assessor their own. A
 *                     course named with none is counted once, which is what a
 *                     course taught through no class is. An entry may be an id
 *                     or `{ id, mode }`; a bare id is a taught class, which is
 *                     what every caller passed before pathways existed.
 * @returns Map<courseId, { expected, classes, posted, draft, written, toPost,
 *                          finalPosted, lastPosted }>
 */
export function papersByCourse(assessments, lessonCounts, classIds = new Map()) {
  const asId = (value) => String(value);

  const toDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const documentsByCourse = new Map();
  for (const doc of assessments ?? []) {
    const key = asId(doc.courseId);
    if (!documentsByCourse.has(key)) documentsByCourse.set(key, []);
    documentsByCourse.get(key).push(doc);
  }

  // A course with no lessons on record still gets a row if a paper names it,
  // and a course with lessons and no papers is the one worth reporting.
  const courseKeys = new Set();
  lessonCounts.forEach((_count, key) => courseKeys.add(asId(key)));
  documentsByCourse.forEach((_documents, key) => courseKeys.add(key));

  const papers = new Map();

  for (const courseKey of courseKeys) {
    const documents = documentsByCourse.get(courseKey) ?? [];
    const lessons = lessonCounts.get(courseKey) ?? 0;

    // Null stands for the course itself: the papers everybody takes where no
    // class has been named. It is what every count was before classes existed.
    const named = (classIds.get(courseKey) ?? []).map((entry) =>
      entry && typeof entry === "object"
        ? { id: asId(entry.id ?? entry._id), assessOnly: entry.mode === "assessOnly" }
        : { id: asId(entry), assessOnly: false }
    );
    const counted = named.length ? named : [{ id: null, assessOnly: false }];

    const row = {
      // One paper per lesson plus the final for a taught class; one
      // examination for an assess-only one.
      expected: counted.reduce(
        (sum, cls) => sum + (cls.assessOnly ? 1 : lessons + 1),
        0
      ),
      classes: counted.length,
      posted: 0,
      draft: 0,
      // True only when every class counted has its final out. One section's
      // final is not the course's.
      finalPosted: true,
      lastPosted: null
    };

    for (const cls of counted) {
      const held = papersForClass(documents, cls.id, { assessOnly: cls.assessOnly });
      const postedLessons = new Set();
      let finalPosted = false;

      for (const doc of held) {
        // `isPosted` and nothing else. Only a paper an assessor posted counts,
        // and a document that never said so — including one written before
        // releasing existed — is a draft. It is what the student side reads, so
        // it is what decides here.
        if (!isPosted(doc)) {
          row.draft += 1;
          continue;
        }

        if (doc.scope === "final" || !doc.moduleId) finalPosted = true;
        else postedLessons.add(asId(doc.moduleId));

        const postedAt = toDate(doc.postedAt);
        if (postedAt && (!row.lastPosted || postedAt > row.lastPosted)) row.lastPosted = postedAt;
      }

      // An assess-only class has no lesson papers to count, and the one it
      // does have is the examination.
      row.posted += cls.assessOnly ? (finalPosted ? 1 : 0) : postedLessons.size + (finalPosted ? 1 : 0);
      if (!finalPosted) row.finalPosted = false;
    }

    row.written = row.posted + row.draft;
    row.toPost = Math.max(0, row.expected - row.posted);
    papers.set(courseKey, row);
  }

  return papers;
}
