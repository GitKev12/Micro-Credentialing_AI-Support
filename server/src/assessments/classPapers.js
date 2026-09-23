/**
 * Which paper belongs to which class.
 *
 * A course can be taught through more than one class — Section A and Section B
 * of the same subject, an assessor each — and until now a paper belonged to the
 * course. One generation was every section's quiz: each assessor opened the
 * other's drafts, either could rewrite them, and posting one released it to
 * everybody enrolled. Two assessors could not set their own classes different
 * papers, which is the ordinary thing to want.
 *
 * So a paper carries `classId`: the class it was written for. Everything in
 * this file is the one rule that follows from it, written once because the
 * student's rail, the assessor's screen and the final's assembler all have to
 * read it the same way.
 *
 * `classId: null` is not "no class". It is the paper the whole course takes —
 * which is every paper written before this existed, and every paper on a course
 * that has no classes behind it at all. A class with no paper of its own falls
 * back to it, so nothing that was posted before stops being posted.
 *
 * An assess-only class is the exception, and takes nothing course-wide. Its
 * candidates have no lessons to finish, so a course-wide lesson quiz is not a
 * paper they could take; and its examination is written to its own blueprint
 * at its own length, so the course's final is the wrong paper rather than a
 * reasonable stand-in. Falling back would hand a hundred-question candidate the
 * sixty-question paper the taught section takes — silently, and scored out of
 * the wrong total. It holds its own papers or it holds none.
 */

const idOf = (value) => (value == null ? null : String(value));

/** The class a paper was written for, or null for a course-wide one. */
export const paperClassId = (doc) => idOf(doc?.classId);

/**
 * Whether this paper is one that class takes: its own, or the course's.
 *
 * `assessOnly` drops the second half — see the note above on why that class
 * inherits nothing.
 */
export function paperBelongsToClass(doc, classId, { assessOnly = false } = {}) {
  const written = paperClassId(doc);
  if (written !== null) return written === idOf(classId);
  return !assessOnly;
}

/** What makes two papers the same paper: the lesson, or the course's final. */
const slotOf = (doc) =>
  doc?.scope === "final" ? "final" : `lesson:${idOf(doc?.moduleId) ?? ""}`;

/**
 * The papers one class actually sits, one per lesson and one final.
 *
 * Their own where they have one, the course-wide paper where they do not, and
 * never another class's. A class that has been given its own quiz for lesson
 * three and nothing else takes its own for three and the course's for the rest.
 * An assess-only class takes only its own, whatever the course holds.
 */
export function papersForClass(assessments, classId, { assessOnly = false } = {}) {
  const wanted = idOf(classId);
  const bySlot = new Map();

  for (const doc of assessments ?? []) {
    if (!paperBelongsToClass(doc, wanted, { assessOnly })) continue;

    const slot = slotOf(doc);
    const held = bySlot.get(slot);

    // The class's own beats the course's. Nothing else can collide: the unique
    // index allows one paper per lesson per class.
    if (!held || (paperClassId(held) === null && paperClassId(doc) !== null)) {
      bySlot.set(slot, doc);
    }
  }

  return [...bySlot.values()];
}
