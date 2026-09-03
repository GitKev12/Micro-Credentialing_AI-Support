import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { toAssessmentSummary } from "../assessments/assessments.format.js";
import { scoreOf } from "../assessors/grading.js";

/**
 * Who holds which badges.
 *
 * The Badge collection is a catalog — one badge per lesson, carrying that
 * lesson's name as its title, its chapter position as its order, and its
 * course's own artwork as its icon (a data: URI, so every course's badges look
 * like that course). Nothing in it is per-student: a badge is earned by
 * passing that lesson's quiz, and this module is the one place that decides
 * whether a given student has.
 *
 * It lives apart from any one controller because two screens now ask the same
 * question of it — the student's own badge wall, and the admin's record of a
 * student — and the two must never answer it differently.
 */

const ASSESSMENTS_COLLECTION = "Assessment";
const BADGES_COLLECTION = "Badge";
const RESULTS_COLLECTION = "StudentResult";

const collection = (name) => mongoose.connection.collection(name);
const isoDate = (value) => (value ? new Date(value).toISOString() : null);

function courseCodeOf(course) {
  return String(course?.code ?? course?.courseCode ?? course?.course_code ?? "").trim();
}

function courseTitleOf(course) {
  return course?.title ?? course?.courseName ?? course?.name ?? course?.course_name ?? "";
}

/**
 * moduleId → the date that lesson's quiz was passed, for every lesson quiz
 * this student has passed.
 *
 * The mark that counts is the assessor's released review where there is one
 * and the automatic mark otherwise — the same rule the quiz gates apply, so a
 * badge appears exactly when the final assessment stops counting that quiz as
 * outstanding.
 */
export async function passedLessonQuizzes(studentId, student) {
  if (!(await collectionExists(RESULTS_COLLECTION))) return new Map();

  const studentKeys = [
    ...idCandidates(studentId),
    ...(student?._id ? idCandidates(student._id) : [])
  ];

  const results = await collection(RESULTS_COLLECTION)
    .find({ studentId: { $in: studentKeys }, superseded: { $ne: true } })
    .toArray();
  if (results.length === 0) return new Map();

  // The quiz behind each submission: the pass mark and the scope live on the
  // assessment, not on the result.
  const assessments = (await collectionExists(ASSESSMENTS_COLLECTION))
    ? await collection(ASSESSMENTS_COLLECTION)
        .find({ _id: { $in: results.flatMap((result) => idCandidates(result.assessmentId)) } })
        .toArray()
    : [];

  return passedFromResults(
    results,
    new Map(assessments.map((entry) => [String(entry._id), entry]))
  );
}

/**
 * The same question asked of submissions already in hand.
 *
 * The admin's student list counts badges for every student at once, and going
 * back to the database per student to do it would be one round trip per row.
 * It hands its submissions here instead — so the list and the badge wall run
 * the identical rule, which is the whole reason this module exists.
 */
export function passedFromResults(results, assessmentById) {
  const passed = new Map();

  for (const result of results) {
    // A superseded sitting decides nothing. The latest attempt is the one that
    // counts everywhere else, and this module exists so the badge wall and the
    // admin list read the same rule as the quiz gate — see lockStateFor.
    if (result.superseded === true) continue;

    const assessment = assessmentById.get(String(result.assessmentId));
    if (!assessment) continue;

    // A row too malformed to normalize would otherwise throw here, and one bad
    // assessment would take down every badge count on the page.
    const summary = toAssessmentSummary(assessment);
    if (!summary) continue;

    // The final exam earns the certificate, not a badge — badges are one per
    // lesson, and the final belongs to no single lesson.
    if (summary.scope !== "lesson") continue;

    const moduleId = String(result.moduleId ?? summary.moduleId ?? "");
    if (!moduleId) continue;

    if (scoreOf(result) < Number(summary.passMark)) continue;

    // Dated from the moment the pass became true, which is the moment the
    // paper was handed in — a mark is final where it is made, so there is no
    // later regrade for the badge to wait on.
    const at = isoDate(result.submittedAt);

    const held = passed.get(moduleId);
    if (!held || new Date(at ?? 0) < new Date(held)) passed.set(moduleId, at);
  }

  return passed;
}

/**
 * The badge one lesson's quiz earns, in the shape a card draws it.
 *
 * Read at the moment a quiz is passed, so the student can be told what they
 * just won by name. It goes to the same catalog the badge wall reads, which is
 * why the two can never disagree about a badge's title or its artwork — and why
 * this returns null rather than inventing a badge for a lesson the catalog has
 * no row for.
 */
export async function lessonBadgeFor(moduleId) {
  if (!moduleId) return null;
  if (!(await collectionExists(BADGES_COLLECTION))) return null;

  const badge = await collection(BADGES_COLLECTION).findOne({
    active: { $ne: false },
    moduleId: { $in: idCandidates(moduleId) }
  });
  if (!badge) return null;

  return {
    id: String(badge._id),
    // The badge's title is the lesson's name — the same field the wall shows.
    name: badge.title ?? badge.lessonTitle ?? "Lesson badge",
    icon: badge.icon ?? null,
    iconType:
      badge.iconType ?? (String(badge.icon ?? "").startsWith("data:") ? "svg" : "emoji"),
    order: Number(badge.order ?? 0)
  };
}

/**
 * Every badge in the student's own courses, earned ones marked.
 *
 * `courses` is the enrolment, already loaded by the caller — the catalog holds
 * every course's badges, and a student has no business being shown badges they
 * cannot earn.
 */
export async function buildStudentBadges(studentId, student, courses) {
  if (courses.length === 0) return [];
  if (!(await collectionExists(BADGES_COLLECTION))) return [];

  const codes = [...new Set(courses.map(courseCodeOf).filter(Boolean))];

  const catalogue = await collection(BADGES_COLLECTION)
    .find({
      active: { $ne: false },
      $or: [
        { courseId: { $in: courses.flatMap((course) => idCandidates(course._id)) } },
        ...(codes.length
          ? [
              {
                courseCode: {
                  $in: [...new Set(codes.flatMap((code) => [code, code.toUpperCase()]))]
                }
              }
            ]
          : [])
      ]
    })
    .toArray();
  if (catalogue.length === 0) return [];

  const passed = await passedLessonQuizzes(studentId, student);

  const courseById = new Map(courses.map((course) => [String(course._id), course]));
  const courseByCode = new Map(
    courses.map((course) => [courseCodeOf(course).toLowerCase(), course])
  );
  // Courses keep the order the enrolment gave them, so the badge wall is laid
  // out the same way "My Courses" is.
  const courseRank = new Map(courses.map((course, position) => [String(course._id), position]));

  return catalogue
    .map((badge) => {
      const course =
        courseById.get(String(badge.courseId)) ??
        courseByCode.get(String(badge.courseCode ?? "").trim().toLowerCase());
      const earnedAt = passed.get(String(badge.moduleId)) ?? null;

      return {
        id: String(badge._id),
        moduleId: badge.moduleId ? String(badge.moduleId) : null,
        // The badge's title is the lesson's name — that is how the catalog was
        // built, and it is what the student is being told they passed.
        name: badge.title ?? badge.lessonTitle ?? "Lesson badge",
        lessonTitle: badge.lessonTitle ?? badge.title ?? "",
        description: badge.description ?? "",
        // Artwork, per course: a data: URI the client renders as an image.
        // `iconType` says which — older rows carried an emoji in this field.
        icon: badge.icon ?? null,
        iconType:
          badge.iconType ?? (String(badge.icon ?? "").startsWith("data:") ? "svg" : "emoji"),
        courseId: course ? String(course._id) : String(badge.courseId ?? ""),
        courseCode: (course ? courseCodeOf(course) : "") || String(badge.courseCode ?? ""),
        courseTitle: course ? courseTitleOf(course) : "",
        // Chapter position within its course.
        order: Number(badge.order ?? 0),
        earnedBy: badge.earnedBy ?? "quiz-pass",
        earned: Boolean(earnedAt),
        earnedAt,
        // One quiz, so the count is only ever 0 or 1 — kept because the tiles
        // share their progress markup with the older count-based badges.
        current: earnedAt ? 1 : 0,
        target: 1
      };
    })
    .sort((a, b) => {
      const rank =
        (courseRank.get(a.courseId) ?? Number.MAX_SAFE_INTEGER) -
        (courseRank.get(b.courseId) ?? Number.MAX_SAFE_INTEGER);
      if (rank !== 0) return rank;
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name, "en");
    });
}

/**
 * The same badges counted rather than listed: a total, and a row per course.
 *
 * The admin console shows how a student stands, not the artwork, so it takes
 * the counts — but from the same list the student sees, which is the point of
 * deriving it here rather than counting quizzes again somewhere else.
 */
export function summarizeBadges(badges) {
  const byCourse = new Map();

  for (const badge of badges) {
    const key = badge.courseId || badge.courseCode || "unassigned";
    if (!byCourse.has(key)) {
      byCourse.set(key, {
        courseId: badge.courseId,
        code: badge.courseCode,
        title: badge.courseTitle,
        earned: 0,
        total: 0
      });
    }

    const row = byCourse.get(key);
    row.total += 1;
    if (badge.earned) row.earned += 1;
  }

  const courses = [...byCourse.values()];

  return {
    earned: badges.filter((badge) => badge.earned).length,
    total: badges.length,
    // Most recent first: what a student earned last is what an admin looking
    // at the record is most likely asking about.
    latest:
      badges
        .filter((badge) => badge.earned)
        .sort((a, b) => new Date(b.earnedAt ?? 0) - new Date(a.earnedAt ?? 0))[0] ?? null,
    courses
  };
}
