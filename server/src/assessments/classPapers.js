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
 * `classId: null` is not "no class". It is the paper the whole course sits —
 * which is every paper written before this existed, and every paper on a course
 * that has no classes behind it at all. A class with no paper of its own falls
 * back to it, so nothing that was posted before stops being posted.
 */

const idOf = (value) => (value == null ? null : String(value));

/** The class a paper was written for, or null for a course-wide one. */
export const paperClassId = (doc) => idOf(doc?.classId);

/** Whether this paper is one that class sits: its own, or the course's. */
export function paperBelongsToClass(doc, classId) {
  const written = paperClassId(doc);
  return written === null || written === idOf(classId);
}

/** What makes two papers the same paper: the lesson, or the course's final. */
const slotOf = (doc) =>
  doc?.scope === "final" ? "final" : `lesson:${idOf(doc?.moduleId) ?? ""}`;

/**
 * The papers one class actually sits, one per lesson and one final.
 *
 * Their own where they have one, the course-wide paper where they do not, and
 * never another class's. A class that has been given its own quiz for lesson
 * three and nothing else sits its own for three and the course's for the rest.
 */
export function papersForClass(assessments, classId) {
  const wanted = idOf(classId);
  const bySlot = new Map();

  for (const doc of assessments ?? []) {
    if (!paperBelongsToClass(doc, wanted)) continue;

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
