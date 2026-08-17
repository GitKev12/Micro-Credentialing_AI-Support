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
 * items each lesson was worth before anyone sat it. That is what makes the two
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
 * Overall performance is those two combined:
 *
 *     Overall (%) = SUM( Wi x Skill Score i )
 *
 * ── The threshold ──────────────────────────────────────────────────────────
 * 60%, which is TSU's passing percentage by memorandum — the same figure
 * DEFAULT_PASS_RATIO sets every paper's pass mark from. Below it a topic is
 * weak; at or above it, strong.
 */

import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";

const RESULTS_COLLECTION = "StudentResult";
const ASSESSMENTS_COLLECTION = "Assessment";

/** Below this a topic is weak. Not a tuning knob — see the header. */
export const SKILL_THRESHOLD = 60;

const asId = (value) => String(value);
const round = (value) => Math.round(value * 10) / 10;

/** Courses carry their code under one of three spellings, depending on age. */
const courseCodeOf = (course) =>
  String(course?.code ?? course?.courseCode ?? course?.course_code ?? "").trim();

/**
 * The verdict that counts.
 *
 * An assessor who overrules an item has looked at the answer; the automatic
 * mark has not. So an override wins here exactly as it wins in the score the
 * assessor console reports, or a student's topic breakdown would contradict the
 * grade printed above it.
 */
function verdictsOf(result) {
  const overrides = result?.review?.overrides ?? {};

  return (result?.aiGrading?.items ?? []).map((item) => ({
    ...item,
    verdict: overrides[asId(item.itemId)] ?? item.verdict
  }));
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
 * One course's skill gap, from one sat final exam.
 *
 * Returns null when the paper cannot be broken down by lesson at all, because
 * an empty breakdown and a breakdown of zeros say very different things and the
 * dashboard should not have to tell them apart.
 */
export function skillGapFromFinal(result, assessment) {
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
      label: score >= SKILL_THRESHOLD ? "strong" : "weak"
    };
  });

  const performance =
    totalCorrect > 0
      ? skills.reduce((sum, skill) => sum + (skill.correct / totalCorrect) * skill.score, 0)
      : 0;

  return {
    skills: skills.sort((left, right) => left.score - right.score),
    performance: Math.round(performance),
    itemsAsked: skills.reduce((sum, skill) => sum + skill.total, 0),
    itemsCorrect: totalCorrect
  };
}

/**
 * Every course this student has sat the final for, with its breakdown.
 *
 * A course whose final has not been sat is absent rather than present at zero —
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
      assessmentId: { $in: finals.flatMap((doc) => idCandidates(doc._id)) }
    })
    .toArray();

  if (results.length === 0) return [];

  const finalById = new Map(finals.map((doc) => [asId(doc._id), doc]));
  const courseById = new Map(courses.map((course) => [asId(course._id), course]));

  return results
    .map((result) => {
      const assessment = finalById.get(asId(result.assessmentId));
      const course = courseById.get(asId(assessment?.courseId));
      const analysis = skillGapFromFinal(result, assessment);
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
        // Provisional until an assessor releases the grade, which is the same
        // rule the certificate follows.
        status: result.review?.status === "released" ? "completed" : "in-progress",
        reviewStatus: result.review?.status ?? "pending",
        performance: analysis.performance,
        itemsAsked: analysis.itemsAsked,
        itemsCorrect: analysis.itemsCorrect,
        skills: analysis.skills
      };
    })
    .filter(Boolean);
}
