/**
 * Skill gap analysis: what a course's final exam says, lesson by lesson.
 *
 * ── Where the numbers come from ────────────────────────────────────────────
 * The final exam, and only the final exam. A lesson quiz measures one lesson
 * the week it was studied; the final measures every lesson at once, under the
 * same conditions, which is the only comparison that makes "this topic is
 * weaker than that one" mean anything. So nothing here reads a lesson quiz, and
 * nothing is recomputed when one is submitted.
 *
 * Each item on a final carries the lesson it was written for (see
 * assembleFinalAssessment), and the paper's `itemsPerModule` fixed how many
 * items each lesson was worth before anyone took it. That is what makes the two
 * formulas below computable at all.
 *
 * ── The two formulas ───────────────────────────────────────────────────────
 * Skill Score, per lesson — the student's proficiency in that topic:
 *
 *     Skill Score (%) = (correct items for the lesson / items asked of it) x 100
 *
 * Weight, per lesson — how much of what the student got right came from it:
 *
 *     Wi = fi / SUM(fi)
 *
 * `fi` is the count of correct items for lesson i, and the divisor is the total
 * correct across the paper, so the weights sum to 1. The source document writes
 * that divisor as the total number of *items*, which makes the weights sum to
 * the raw score instead — and a student who passed the final at 66.7% would
 * then be shown 44.8% overall, below the passing mark their own exam just
 * cleared. Normalising over total correct keeps the weighting the document
 * asked for (strong topics pull the figure up) without that collapse.
 *
 * Overall performance is NOT those two combined. It is the exam mark:
 *
 *     Overall (%) = (total correct / total items) x 100
 *
 * The weighted combination SUM( Wi x Skill Score i ) is reported alongside it
 * as `weightedPerformance`, because that is what the career recommendation
 * reads. The two answer different questions, and only one of them belongs
 * under a label that says "Overall Performance": weighting by correct answers
 * gives a topic the student scored nothing in a weight of zero, so it vanishes
 * from the total instead of lowering it. A 47-out-of-60 paper came out at 98%
 * that way, printed directly above two topics marked weak at 0%.
 *
 * ── The cut-off and the four tiers ─────────────────────────────────────────
 * Each class has a cut-off (the target competency). It starts at 60% and the
 * class's assessor can change it. The cut-off splits the scores into four
 * tiers by linear interpolation — see calculateDynamicTiers.
 */

import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";

const RESULTS_COLLECTION = "StudentResult";
const ASSESSMENTS_COLLECTION = "Assessment";

const CLASSES_COLLECTION = "Class";

/** The cut-off a class uses until its assessor changes it. */
export const DEFAULT_CUTOFF = 60;

/** A cut-off from a form: a whole number from 1 to 99, or null. */
export function readCutoff(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 99 ? number : null;
}

/** The cut-off a class uses. */
export const cutoffOf = (cls) => readCutoff(cls?.cutoff) ?? DEFAULT_CUTOFF;

/**
 * The four tiers for one cut-off.
 * The space above the cut-off is split in two, and the same width is used
 * below it. Cut-off 60 -> 80-100, 60-79, 40-59, 0-39.
 */
export function calculateDynamicTiers(cutoff) {
  const interval = Math.round((100 - cutoff) / 2);

  return [
    { id: "strength", status: "Strength", min: cutoff + interval, max: 100, color: "green" },
    { id: "competent", status: "Competent", min: cutoff, max: cutoff + interval - 1, color: "blue" },
    {
      id: "needs-improvement",
      status: "Needs Improvement",
      min: Math.max(0, cutoff - interval),
      max: cutoff - 1,
      color: "orange"
    },
    {
      id: "skill-gap",
      status: "Significant Skill Gap",
      min: 0,
      max: cutoff - interval - 1,
      color: "red"
    }
  ];
}

/** Which tier a score falls in. The score is rounded to a whole percent first. */
export function tierFor(score, cutoff) {
  const whole = Math.round(score);
  const tiers = calculateDynamicTiers(cutoff);
  return tiers.find((tier) => whole >= tier.min) ?? tiers[tiers.length - 1];
}

const asId = (value) => String(value);
const round = (value) => Math.round(value * 10) / 10;

/** Courses carry their code under one of three spellings, depending on age. */
const courseCodeOf = (course) =>
  String(course?.code ?? course?.courseCode ?? course?.course_code ?? "").trim();

/**
 * The verdict that counts.
 *
 * Marked against the key at hand-in, and nothing overrides it — an assessor no
 * longer re-marks a submission, so the breakdown a student reads is the one the
 * key produced and it cannot contradict the score printed above it.
 */
function verdictsOf(result) {
  return (result?.aiGrading?.items ?? []).map((item) => ({ ...item }));
}

/**
 * Which lesson each answered item belongs to.
 *
 * Grading writes `moduleId` onto every item of a final, so this is normally
 * just reading it back. The fall-back to the assessment's own item list covers
 * a result graded before items carried their lesson — without it those results
 * would silently report no topics at all.
 */
function lessonOf(item, itemLesson) {
  const direct = item.moduleId ? asId(item.moduleId) : "";
  if (direct) return direct;
  return itemLesson.get(asId(item.itemId)) ?? "";
}

/**
 * One course's skill gap, from one taken final exam.
 *
 * Returns null when the paper cannot be broken down by lesson at all, because
 * an empty breakdown and a breakdown of zeros say very different things and the
 * dashboard should not have to tell them apart.
 */
export function skillGapFromFinal(result, assessment, cutoff = DEFAULT_CUTOFF) {
  const answered = verdictsOf(result);
  if (answered.length === 0) return null;

  const itemLesson = new Map(
    (assessment?.items ?? [])
      .filter((item) => item.moduleId)
      .map((item) => [asId(item.id), asId(item.moduleId)])
  );
  const labelOf = new Map(
    (assessment?.topics ?? []).map((entry) => [asId(entry.moduleId), entry.topic ?? ""])
  );
  const askedOf = new Map(
    Object.entries(assessment?.itemsPerModule ?? {}).map(([id, count]) => [asId(id), Number(count)])
  );

  const tally = new Map();
  for (const item of answered) {
    const moduleId = lessonOf(item, itemLesson);
    if (!moduleId) continue;

    const row = tally.get(moduleId) ?? {
      moduleId,
      topic: item.topic || labelOf.get(moduleId) || "",
      correct: 0,
      total: 0
    };

    row.total += 1;
    if (item.verdict === "correct") row.correct += 1;
    if (!row.topic) row.topic = item.topic || labelOf.get(moduleId) || "";

    tally.set(moduleId, row);
  }

  if (tally.size === 0) return null;

  const rows = [...tally.values()];
  const totalCorrect = rows.reduce((sum, row) => sum + row.correct, 0);

  const skills = rows.map((row) => {
    // The paper's stated allocation is the denominator when it exists: it is
    // what the student was asked, and it cannot drift with what they answered.
    const asked = askedOf.get(row.moduleId) || row.total;
    const score = asked > 0 ? (row.correct / asked) * 100 : 0;

    return {
      moduleId: row.moduleId,
      topic: row.topic || "Untitled lesson",
      correct: row.correct,
      total: asked,
      score: round(score),
      // Wi, normalised so the weights sum to 1. Zero for everyone when nothing
      // was answered correctly, which is the only honest weighting of a blank.
      weight: totalCorrect > 0 ? round((row.correct / totalCorrect) * 100) / 100 : 0,
      // Which of the four tiers, and how far under the cut-off (0 when at or above).
      tier: tierFor(score, cutoff).id,
      gap: Math.max(0, cutoff - Math.round(score))
    };
  });

  const itemsAsked = skills.reduce((sum, skill) => sum + skill.total, 0);

  // Overall performance is the exam mark, plainly: what the student scored on
  // the paper they took. It used to be the weighted figure below, which reads
  // far higher than the exam — a student who answered 47 of 60 was shown 98%,
  // printed directly above two topics marked weak at 0%. Weighting by correct
  // answers gives a topic nobody scored in a weight of zero, so it drops out of
  // the total rather than pulling it down, and the figure stops describing the
  // exam it appears under.
  const performance = itemsAsked > 0 ? (totalCorrect / itemsAsked) * 100 : 0;

  // The weighted figure is still computed, because Wi is what the career
  // recommendation is built on: it asks a different question — "when this
  // student succeeds, which topics is that success coming from" — and for that
  // purpose weighting by correct answers is the point rather than the flaw.
  const weightedPerformance =
    totalCorrect > 0
      ? skills.reduce((sum, skill) => sum + (skill.correct / totalCorrect) * skill.score, 0)
      : 0;

  // The order the paper lists its lessons in, which is the Table of
  // Specification's order. It used to come back weakest-first; that is a
  // ranking, and a ranking of a course's own lessons reads as if the syllabus
  // had been reshuffled. The panel that wants weakest-first sorts for itself.
  const order = new Map(
    (assessment?.topics ?? []).map((entry, index) => [asId(entry.moduleId), index])
  );
  const inPaperOrder = order.size
    ? [...skills].sort(
        (left, right) =>
          (order.get(left.moduleId) ?? order.size) - (order.get(right.moduleId) ?? order.size)
      )
    : skills;

  return {
    cutoff,
    tiers: calculateDynamicTiers(cutoff),
    skills: inPaperOrder,
    performance: Math.round(performance),
    weightedPerformance: Math.round(weightedPerformance),
    itemsAsked,
    itemsCorrect: totalCorrect
  };
}

/**
 * The cut-off of the student's class on each course, as Map<courseId, cutoff>.
 * A course with no class for this student is left out (the default is used).
 */
async function loadCutoffs(studentId, courses) {
  const cutoffs = new Map();
  if (!(await collectionExists(CLASSES_COLLECTION))) return cutoffs;

  const classes = await mongoose.connection
    .collection(CLASSES_COLLECTION)
    .find(
      {
        courseId: { $in: courses.flatMap((course) => idCandidates(course._id)) },
        studentIds: { $in: idCandidates(studentId) }
      },
      { projection: { courseId: 1, cutoff: 1 } }
    )
    .toArray();

  for (const cls of classes) cutoffs.set(asId(cls.courseId), cutoffOf(cls));
  return cutoffs;
}

/**
 * Every course this student has taken the final for, with its breakdown.
 *
 * A course whose final has not been taken is absent rather than present at zero —
 * "not measured yet" is not a gap, and showing it as one would tell a student
 * they are failing a course they have not been examined on.
 */
export async function buildStudentSkillGap(studentId, courses) {
  if (!courses.length) return [];
  if (!(await collectionExists(ASSESSMENTS_COLLECTION))) return [];
  if (!(await collectionExists(RESULTS_COLLECTION))) return [];

  const courseIds = courses.flatMap((course) => idCandidates(course._id));

  const finals = await mongoose.connection
    .collection(ASSESSMENTS_COLLECTION)
    .find({ courseId: { $in: courseIds }, scope: "final" })
    .toArray();

  if (finals.length === 0) return [];

  const results = await mongoose.connection
    .collection(RESULTS_COLLECTION)
    .find({
      studentId: { $in: idCandidates(studentId) },
      assessmentId: { $in: finals.flatMap((doc) => idCandidates(doc._id)) },
      // One breakdown per course. A student with three attempts at the final
      // would otherwise get three rows for the same course, all claiming to be
      // the analysis of it.
      superseded: { $ne: true }
    })
    .toArray();

  if (results.length === 0) return [];

  const cutoffByCourse = await loadCutoffs(studentId, courses);
  const finalById = new Map(finals.map((doc) => [asId(doc._id), doc]));
  const courseById = new Map(courses.map((course) => [asId(course._id), course]));

  return results
    .map((result) => {
      const assessment = finalById.get(asId(result.assessmentId));
      const course = courseById.get(asId(assessment?.courseId));
      const analysis = skillGapFromFinal(
        result,
        assessment,
        cutoffByCourse.get(asId(assessment?.courseId)) ?? DEFAULT_CUTOFF
      );
      if (!analysis) return null;

      return {
        id: asId(assessment?.courseId ?? result.courseId),
        title:
          course?.title ?? course?.courseName ?? course?.name ?? assessment?.title ?? "",
        // The short code the dashboard leads each course card with. A title
        // wraps to two lines in a card header; "CC2" is what a student calls
        // the course anyway.
        code: courseCodeOf(course),
        icon: null,
        imageUrl: course?.imageUrl ?? course?.image_url ?? null,
        // Complete the moment the final is handed in: it is marked there, and
        // there is no release step left for it to be provisional against.
        status: "completed",
        performance: analysis.performance,
        cutoff: analysis.cutoff,
        tiers: analysis.tiers,
        // Which paper this came from, and when it was handed in.
        exam: {
          title: assessment?.title ?? null,
          takenAt: result.submittedAt ?? null
        },
        itemsAsked: analysis.itemsAsked,
        itemsCorrect: analysis.itemsCorrect,
        skills: analysis.skills
      };
    })
    .filter(Boolean);
}
