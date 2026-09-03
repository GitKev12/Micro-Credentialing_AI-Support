import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { buildStudentBadges, passedFromResults, summarizeBadges } from "../badges/badges.service.js";
import { blueprintFromTos } from "../assessments/assessments.blueprint.js";
import { papersByCourse } from "../assessments/papers.js";
import {
  assembleFinalAssessment,
  ensureAssessmentIndexes,
  generateModuleAssessment,
  getGenerationStatus
} from "../assessments/assessments.generate.js";
import { toIsoDay } from "../lib/courseDates.js";
import { sortLessons } from "../lib/lessonOrder.js";

/**
 * Admin console endpoints — courses, students, assessors and the Table of
 * Specification.
 *
 * These read the live MainSystemDB collections. Nothing here describes a
 * student's degree batch — no program, no year, no enrolment status. This is a
 * micro-credentialing system: what it reports is work done and credentials
 * earned, and a field nothing acts on is one more thing to keep true for no
 * return. Everything below is either read straight from a document or derived
 * from real data:
 *
 *   course.moduleCount   <- LearningModule documents for that course
 *   course.studentCount  <- Students whose enrolledCourses contains it
 *   student.progress     <- ModuleProgress completions vs. modules per course
 *   student.activity     <- lessons, badges and last-seen, folded per student
 *   assessor.students    <- assigned_students on the Assessor document
 *   assessor.papers      <- Assessments posted to their courses, against the
 *                           lessons those courses hold
 *   assessor.workload    <- StudentResults in the courses they are assigned to
 */
const ADMIN_COLLECTION = "Admin";
const ASSESSMENTS_COLLECTION = "Assessment";
const ASSESSORS_COLLECTION = "Assessor";
const BADGES_COLLECTION = "Badge";
const COURSES_COLLECTION = "Course";
const MODULES_COLLECTION = "LearningModule";
const PROGRESS_COLLECTION = "ModuleProgress";
const RESULTS_COLLECTION = "StudentResult";
const STUDENTS_COLLECTION = "Student";
const TOS_COLLECTION = "TableOfSpecification";

const collection = (name) => mongoose.connection.collection(name);

function databaseReady() {
  return mongoose.connection.readyState === 1;
}

function serviceUnavailable(response) {
  return response.status(503).json({
    message: "The database is not connected. Set MONGODB_URI and restart the API."
  });
}

const asId = (value) => String(value);

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The newest usable date in a list, or null when there is none. */
function newestDate(values) {
  return values.reduce((latest, value) => {
    const date = toDate(value);
    return date && (!latest || date > latest) ? date : latest;
  }, null);
}

/**
 * Whichever kind of work happened last, named.
 *
 * "A quiz two months ago" and "a lesson yesterday" mean different things about
 * the same student, so the kind travels with the date. Shared by the list —
 * which folds this out of everyone's records at once — and the detail screen,
 * which looks one student up, so the two can never disagree about which came
 * last.
 */
function latestActivity(lesson, quiz) {
  if (!lesson && !quiz) return { at: null, kind: null };

  const quizIsNewer = quiz && (!lesson || quiz > lesson);
  return {
    at: (quizIsNewer ? quiz : lesson).toISOString(),
    kind: quizIsNewer ? "quiz" : "lesson"
  };
}

function courseTitle(course) {
  return course?.courseName ?? course?.title ?? course?.name ?? "";
}

function courseCode(course) {
  return (course?.courseCode ?? course?.code ?? "").trim();
}

function studentName(student) {
  const full = [student?.first_name, student?.last_name].filter(Boolean).join(" ").trim();
  return full || student?.full_name || student?.name || student?.email || "Unnamed student";
}

/** Courses keyed by their string id, for resolving enrollment references. */
async function courseMap() {
  const courses = await collection(COURSES_COLLECTION).find().toArray();
  return new Map(courses.map((course) => [asId(course._id), course]));
}

/* ─────────────────────────── Courses ─────────────────────────── */

export async function listCourses(_request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const courses = await collection(COURSES_COLLECTION).find().toArray();

  // Module counts per course, in one pass.
  const moduleCounts = new Map();
  if (await collectionExists(MODULES_COLLECTION)) {
    const grouped = await collection(MODULES_COLLECTION)
      .aggregate([{ $group: { _id: "$courseId", count: { $sum: 1 } } }])
      .toArray();
    grouped.forEach((row) => moduleCounts.set(asId(row._id), row.count));
  }

  // Enrollment counts per course, derived from Student.enrolledCourses.
  const studentCounts = new Map();
  const students = await collection(STUDENTS_COLLECTION)
    .find({}, { projection: { enrolledCourses: 1 } })
    .toArray();
  students.forEach((student) => {
    (student.enrolledCourses ?? []).forEach((courseId) => {
      const key = asId(courseId);
      studentCounts.set(key, (studentCounts.get(key) ?? 0) + 1);
    });
  });

  return response.json({
    courses: courses.map((course) => ({
      id: asId(course._id),
      code: courseCode(course),
      title: courseTitle(course),
      description: course.description ?? "",
      startsOn: toIsoDay(course.startsOn),
      endsOn: toIsoDay(course.endsOn),
      hasImage: Boolean(course.imageFileId),
      moduleCount: moduleCounts.get(asId(course._id)) ?? 0,
      studentCount: studentCounts.get(asId(course._id)) ?? 0
    }))
  });
}

export async function getCourse(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const course = await collection(COURSES_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });

  if (!course) return response.status(404).json({ message: "Course not found." });

  // Lesson order, not title order: "Chapter 10" belongs after "Chapter 2",
  // and this is the screen a lesson is uploaded from — it has to land where
  // the student will find it.
  const modules = sortLessons(
    await collection(MODULES_COLLECTION)
      .find({
        $or: [
          { courseId: { $in: idCandidates(course._id) } },
          { courseCode: courseCode(course) }
        ]
      })
      .toArray()
  );

  return response.json({
    course: {
      id: asId(course._id),
      code: courseCode(course),
      title: courseTitle(course),
      description: course.description ?? "",
      startsOn: toIsoDay(course.startsOn),
      endsOn: toIsoDay(course.endsOn),
      hasImage: Boolean(course.imageFileId),
      imageUpdatedAt: toIsoDay(course.imageUpdatedAt),
      modules: modules.map((module) => ({
        id: asId(module._id),
        title: module.title ?? module.fileName ?? "Untitled module",
        fileName: module.fileName ?? "",
        fileSize: module.fileSize ?? null,
        uploadDate: module.uploadDate ?? null
      }))
    }
  });
}

/* ─────────────────────────── Students ─────────────────────────── */

/** Completed-module counts per course for one student. */
async function progressForStudent(student, courses) {
  const enrolled = student.enrolledCourses ?? [];
  if (enrolled.length === 0) return [];

  const completed = await collection(PROGRESS_COLLECTION)
    .find({ studentId: { $in: idCandidates(student._id) } })
    .toArray();

  const completedByCourse = new Map();
  // When each course was last worked on. A micro-credential has no record of
  // its own — it is a course finished to the last lesson — so the newest
  // completion in a course that is fully done is the date it was earned.
  const finishedByCourse = new Map();
  completed.forEach((entry) => {
    const key = asId(entry.courseId);
    completedByCourse.set(key, (completedByCourse.get(key) ?? 0) + 1);

    const at = toDate(entry.completedAt);
    const newest = finishedByCourse.get(key);
    if (at && (!newest || at > newest)) finishedByCourse.set(key, at);
  });

  const rows = [];
  for (const courseId of enrolled) {
    const key = asId(courseId);
    const course = courses.get(key);
    if (!course) continue;

    const total = await collection(MODULES_COLLECTION).countDocuments({
      $or: [{ courseId: { $in: idCandidates(courseId) } }, { courseCode: courseCode(course) }]
    });
    const done = completedByCourse.get(key) ?? 0;

    rows.push({
      // The id as well as the title: the student screen shows progress on the
      // same row as that course's badges and assessors, and joining those on a
      // title would break the moment two courses shared one.
      courseId: key,
      label: courseTitle(course),
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      completed: done,
      total,
      completedAt: finishedByCourse.get(key)?.toISOString() ?? null
    });
  }
  return rows;
}

function blankActivity() {
  return {
    lessonsDone: 0,
    lessonsTotal: 0,
    badgesEarned: 0,
    badgesTotal: 0,
    pending: 0,
    lastActive: { at: null, kind: null }
  };
}

/**
 * How many of a course's modules there are.
 *
 * Modules name their course by id on some rows and by code on others, and
 * `progressForStudent` reads both — the list has to match it, or the same
 * student would show a different denominator on the two screens.
 */
function modulesPerCourse(courses, modules) {
  const counts = new Map();

  for (const course of courses.values()) {
    const ids = new Set(idCandidates(course._id).map(asId));
    const code = courseCode(course);

    counts.set(
      asId(course._id),
      modules.filter(
        (module) => ids.has(asId(module.courseId)) || (code && module.courseCode === code)
      ).length
    );
  }

  return counts;
}

/** The badge catalog split by course, matched by id or by code as badges are written. */
function badgesPerCourse(courses, badges) {
  const byCourse = new Map();

  for (const course of courses.values()) {
    const ids = new Set(idCandidates(course._id).map(asId));
    const code = courseCode(course).trim().toLowerCase();

    byCourse.set(
      asId(course._id),
      badges.filter(
        (badge) =>
          ids.has(asId(badge.courseId)) ||
          (code && String(badge.courseCode ?? "").trim().toLowerCase() === code)
      )
    );
  }

  return byCourse;
}

/**
 * What each student has actually done, folded out of the whole set at once.
 *
 * The list showed a name and a course count and nothing else, so a student who
 * had never opened a lesson was indistinguishable from one most of the way
 * through. Everything here is derived from records that already exist:
 *
 *   lessonsDone  <- ModuleProgress completions inside their enrolled courses
 *   badgesEarned <- lesson quizzes passed, against the badges those courses have
 *   pending      <- their submissions an assessor has not released yet
 *   lastActive   <- the newer of their last completion and their last submission
 *
 * Kept separate from the queries that feed it so it can be exercised without a
 * database, the same way `tallyWorkload` is.
 */
export function tallyActivity(students, courses, sources) {
  const { modules = [], progress = [], results = [], badges = [], assessments = [] } = sources;

  const lessonCounts = modulesPerCourse(courses, modules);
  const badgeCounts = badgesPerCourse(courses, badges);
  const assessmentById = new Map(assessments.map((entry) => [asId(entry._id), entry]));

  const groupBy = (rows) => {
    const grouped = new Map();
    rows.forEach((row) => {
      const key = asId(row.studentId);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });
    return grouped;
  };

  const progressByStudent = groupBy(progress);
  const resultsByStudent = groupBy(results);

  const activities = new Map();

  for (const student of students) {
    const key = asId(student._id);
    const activity = blankActivity();

    // Only courses they are actually in: a completion left behind by a course
    // they have since been unenrolled from is not progress toward anything.
    const enrolled = (student.enrolledCourses ?? []).map(asId);
    const enrolledSet = new Set(enrolled);

    const completions = progressByStudent.get(key) ?? [];
    const submissions = resultsByStudent.get(key) ?? [];

    activity.lessonsDone = completions.filter((entry) =>
      enrolledSet.has(asId(entry.courseId))
    ).length;
    activity.lessonsTotal = enrolled.reduce(
      (sum, courseId) => sum + (lessonCounts.get(courseId) ?? 0),
      0
    );

    // One badge per lesson, earned by passing that lesson's quiz — decided by
    // the badge module, not re-derived here.
    const passed = passedFromResults(submissions, assessmentById);
    const catalogue = enrolled.flatMap((courseId) => badgeCounts.get(courseId) ?? []);
    activity.badgesTotal = catalogue.length;
    activity.badgesEarned = catalogue.filter((badge) => passed.has(asId(badge.moduleId))).length;

    // Passing papers whose credential nobody has issued yet — the one thing
    // still waiting on staff now that marking happens at hand-in. Retired
    // attempts are dropped, as they are on the assessor's own screens.
    const live = submissions.filter((result) => result.superseded !== true);
    activity.awaiting = live.filter((result) => result.credential?.status === "pending").length;

    activity.lastActive = latestActivity(
      newestDate(completions.map((entry) => entry.completedAt)),
      newestDate(submissions.map((result) => result.submittedAt))
    );

    activities.set(key, activity);
  }

  return activities;
}

/** The records behind `tallyActivity`, one query per collection for the page. */
async function activityForStudents(students, courses) {
  const load = async (name, projection) =>
    (await collectionExists(name))
      ? collection(name)
          .find({}, projection ? { projection } : {})
          .toArray()
      : [];

  const [modules, progress, results, badges, assessments] = await Promise.all([
    load(MODULES_COLLECTION, { courseId: 1, courseCode: 1 }),
    load(PROGRESS_COLLECTION, { studentId: 1, courseId: 1, moduleId: 1, completedAt: 1 }),
    load(RESULTS_COLLECTION, {
      studentId: 1,
      courseId: 1,
      moduleId: 1,
      assessmentId: 1,
      submittedAt: 1,
      superseded: 1,
      review: 1,
      aiGrading: 1
    }),
    load(BADGES_COLLECTION, { courseId: 1, courseCode: 1, moduleId: 1, active: 1 }),
    // Unprojected: the pass mark and scope come from normalizing the whole
    // document, so a partial one would decide a badge on missing fields.
    load(ASSESSMENTS_COLLECTION)
  ]);

  return tallyActivity(students, courses, {
    modules,
    progress,
    results,
    badges: badges.filter((badge) => badge.active !== false),
    assessments
  });
}

/**
 * `activity` is attached only where it was computed — the list. The detail
 * screen carries the same facts in fuller forms (`progress`, `badges`,
 * `lastActive`), and a zeroed copy beside them would be a second answer that
 * happened to be wrong.
 */
function publicStudent(student, courses, activity = null) {
  const enrolled = (student.enrolledCourses ?? [])
    .map((courseId) => courses.get(asId(courseId)))
    .filter(Boolean)
    .map((course) => ({
      id: asId(course._id),
      code: courseCode(course),
      title: courseTitle(course)
    }));

  return {
    id: asId(student._id),
    studentNumber: student.student_id ?? null,
    name: studentName(student),
    email: student.email ?? null,
    enrolled,
    // Absent on every account written before the field existed, and none of
    // those were suspended — so missing reads as not suspended, and only an
    // explicit true locks anyone out.
    suspended: student.suspended === true,
    ...(activity ? { activity } : {})
  };
}

export async function listStudents(_request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const [students, courses] = await Promise.all([
    collection(STUDENTS_COLLECTION).find().sort({ last_name: 1 }).toArray(),
    courseMap()
  ]);

  const activity = await activityForStudents(students, courses);

  return response.json({
    students: students.map((s) => publicStudent(s, courses, activity.get(asId(s._id))))
  });
}

/** The documents behind a student's enrolment, in the order they were added. */
function enrolledCourses(student, courses) {
  return (student.enrolledCourses ?? [])
    .map((courseId) => courses.get(asId(courseId)))
    .filter(Boolean);
}

/**
 * When this student was last seen working: the newest lesson completion or
 * quiz submission on their record.
 *
 * Enrolment says a student was signed up; this says whether they ever turned
 * up — which is the question an admin opens a record to ask, and which nothing
 * else on the screen answers.
 */
async function lastActivityFor(student) {
  const studentKeys = idCandidates(student._id);

  const newest = async (name, dateField) => {
    if (!(await collectionExists(name))) return null;
    const [row] = await collection(name)
      .find({ studentId: { $in: studentKeys } })
      .sort({ [dateField]: -1 })
      .limit(1)
      .toArray();
    return row?.[dateField] ? new Date(row[dateField]) : null;
  };

  const [lesson, quiz] = await Promise.all([
    newest(PROGRESS_COLLECTION, "completedAt"),
    newest(RESULTS_COLLECTION, "submittedAt")
  ]);

  return latestActivity(lesson, quiz);
}

/**
 * The assessors responsible for this student — the ones assigned to a course
 * they are enrolled in. Answers "who grades them?", which the roster on the
 * assessor's own screen states from the other direction.
 */
async function assessorsFor(student, courses) {
  const enrolledIds = new Set((student.enrolledCourses ?? []).map(asId));
  if (enrolledIds.size === 0) return [];

  const assessors = await collection(ASSESSORS_COLLECTION).find().toArray();

  return assessors
    .map((assessor) => ({
      assessor,
      shared: (assessor.assigned_courses ?? [])
        .filter((courseId) => enrolledIds.has(asId(courseId)))
        .map((courseId) => courses.get(asId(courseId)))
        .filter(Boolean)
    }))
    .filter((entry) => entry.shared.length > 0)
    .map(({ assessor, shared }) => ({
      id: asId(assessor._id),
      name: assessor.full_name ?? assessor.name ?? assessor.email ?? "Unnamed assessor",
      email: assessor.email ?? null,
      courses: shared.map((course) => ({
        id: asId(course._id),
        code: courseCode(course),
        title: courseTitle(course)
      }))
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
}

export async function getStudent(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const student = await collection(STUDENTS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!student) return response.status(404).json({ message: "Student not found." });

  const courses = await courseMap();
  const enrolled = enrolledCourses(student, courses);

  const [progress, badgeList, lastActive, assessors] = await Promise.all([
    progressForStudent(student, courses),
    // Counted from the same catalog the student's own badge wall reads, so the
    // two screens can never disagree about what someone holds.
    buildStudentBadges(student._id, student, enrolled),
    lastActivityFor(student),
    assessorsFor(student, courses)
  ]);

  // A micro-credential is awarded when every module of a course is done.
  const credentials = progress.filter((row) => row.total > 0 && row.pct === 100).length;

  return response.json({
    student: {
      ...publicStudent(student, courses),
      progress,
      credentials,
      badges: summarizeBadges(badgeList),
      lastActive,
      assessors
    }
  });
}

/* ─────────────────────────── Assessors ─────────────────────────── */

/**
 * What an assessor's console can do, and therefore what this screen reports.
 *
 * Their console reports two numbers about itself — papers still to post and
 * credentials still to issue — and those are the two this screen carries:
 *
 *   Papers      — a course owes one quiz per lesson plus one final, and none of
 *                 them reaches a student until the assessor posts it. This is
 *                 the bulk of their console and the half this screen used to be
 *                 silent about: an assessor who has posted nothing leaves a
 *                 class with nothing to take, and no other screen says so.
 *   Credentials — a passing paper leaves a credential still to issue. That is
 *                 its own section of their console, and the last step a student
 *                 is actually waiting on.
 *
 * Nothing here reports on marking, because an assessor no longer marks. A paper
 * is scored against its key when it is handed in and that score is final, so
 * there is no backlog to age, no flagged item to rule on, and no running total
 * of grades put out. What a person can still be behind on is the credential: a
 * pass writes it as pending, and only an assessor turns that into an issued
 * one.
 */
function blankCourseTally() {
  return {
    papersExpected: 0,
    papersPosted: 0,
    papersDraft: 0,
    credentialsPending: 0,
    credentialsIssued: 0
  };
}

function blankTally() {
  return {
    ...blankCourseTally(),
    // Only the assessor's own totals carry this: it decides `lastActive`, and
    // no table breaks a date down per course.
    lastPosted: null,
    perCourse: new Map()
  };
}

function courseTally(tally, courseKey) {
  if (!tally.perCourse.has(courseKey)) tally.perCourse.set(courseKey, blankCourseTally());
  return tally.perCourse.get(courseKey);
}

/**
 * Folds papers and submissions into a tally per assessor.
 *
 * The list shows a total per assessor and the detail breaks the same total down
 * per course, so both are folded together in one pass rather than queried per
 * row.
 *
 * Papers and submissions both count toward whoever is assigned to the course
 * today.
 *
 * Kept separate from the queries that feed it so the arithmetic can be
 * exercised without a database. StudentResult stays empty until the first paper
 * is posted and somebody takes it, which would otherwise leave every number on
 * these screens unchecked until the day it first mattered.
 */
export function tallyWorkload(assessors, sources) {
  const { results = [], papers = new Map() } = sources ?? {};

  const tallies = new Map(assessors.map((assessor) => [asId(assessor._id), blankTally()]));

  const assessorsByCourse = new Map();
  assessors.forEach((assessor) => {
    // Deduped: a course listed twice on one assessor is an assignment mistake,
    // not two classes, and must not double every figure they carry.
    new Set((assessor.assigned_courses ?? []).map(asId)).forEach((courseKey) => {
      if (!assessorsByCourse.has(courseKey)) assessorsByCourse.set(courseKey, []);
      assessorsByCourse.get(courseKey).push(asId(assessor._id));
    });
  });

  // ── Papers owed and posted ──
  for (const [courseKey, owners] of assessorsByCourse) {
    const paper = papers.get(courseKey);
    if (!paper) continue;

    for (const assessorId of owners) {
      const tally = tallies.get(assessorId);
      if (!tally) continue;
      const perCourse = courseTally(tally, courseKey);

      perCourse.papersExpected = paper.expected;
      perCourse.papersPosted = paper.posted;
      perCourse.papersDraft = paper.draft;

      tally.papersExpected += paper.expected;
      tally.papersPosted += paper.posted;
      tally.papersDraft += paper.draft;

      if (paper.lastPosted && (!tally.lastPosted || paper.lastPosted > tally.lastPosted)) {
        tally.lastPosted = paper.lastPosted;
      }
    }
  }

  // ── Submissions ──
  for (const result of results) {
    // A retired attempt is history, not work. A lesson quiz may be retaken
    // without limit, so counting every attempt would let one student add to an
    // assessor's backlog indefinitely — and the assessor's own screens, the
    // badge wall and the student tally beside this one all drop them already.
    if (result.superseded === true) continue;

    const courseKey = asId(result.courseId);
    const owners = assessorsByCourse.get(courseKey) ?? [];
    if (owners.length === 0) continue;

    // A submission reaches this screen only through its credential. Nothing
    // else about it is read, because nothing else about it is anyone's work.
    const credential = result.credential?.status;

    for (const assessorId of owners) {
      const tally = tallies.get(assessorId);
      if (!tally) continue;
      const perCourse = courseTally(tally, courseKey);

      // Pending: the paper passed and nobody has issued the credential behind
      // it. The same condition the assessor's own Credentials screen uses, so
      // the two cannot disagree about what is waiting on them.
      if (credential === "pending") {
        tally.credentialsPending += 1;
        perCourse.credentialsPending += 1;
      }

      if (credential === "issued") {
        tally.credentialsIssued += 1;
        perCourse.credentialsIssued += 1;
      }
    }
  }

  return tallies;
}

/**
 * The records behind `tallyWorkload`, one query per collection for the page.
 *
 * Every collection read here may be missing on a database where nothing has
 * been generated yet, and an empty console is the honest answer before then.
 */
async function workloadByAssessor(assessors, courses) {
  const load = async (name, projection) =>
    (await collectionExists(name))
      ? collection(name)
          .find({}, projection ? { projection } : {})
          .toArray()
      : [];

  const [results, assessments, modules] = await Promise.all([
    load(RESULTS_COLLECTION, {
      courseId: 1,
      superseded: 1,
      review: 1,
      credential: 1
    }),
    load(ASSESSMENTS_COLLECTION, {
      courseId: 1,
      moduleId: 1,
      scope: 1,
      status: 1,
      postedAt: 1
    }),
    load(MODULES_COLLECTION, { courseId: 1, courseCode: 1 })
  ]);

  // Lessons counted the way the student screens count them — a module names its
  // course by id on some rows and by code on others — so one course cannot owe
  // nine papers here and eight somewhere else.
  const papers = papersByCourse(assessments, modulesPerCourse(courses, modules));

  return { tallies: tallyWorkload(assessors, { results, papers }), papers };
}

function publicWorkload(tally) {
  return {
    // Papers. `toPost` is the assessor's own rail badge, reported here against
    // the two figures it is the difference of, so an admin can tell a course
    // that is nearly covered from one that has never been touched.
    papersExpected: tally.papersExpected,
    papersPosted: tally.papersPosted,
    papersDraft: tally.papersDraft,
    toPost: Math.max(0, tally.papersExpected - tally.papersPosted),

    // Credentials, split by which side of the issue they are on. The screen
    // only ever showed the issued ones, which is the half nobody is waiting on.
    //
    // No `lastPosted` beside them: it is folded into `lastActive`, which is the
    // only form any screen renders. Sending it as well would be the same fact
    // twice, and the second copy would be an answer nothing keeps true.
    credentialsPending: tally.credentialsPending,
    credentialsIssued: tally.credentialsIssued
  };
}

function publicAssessor(assessor, courses, tally = blankTally()) {
  // No `section`: Course documents do not carry one, and this used to send the
  // course code under that name — the detail screen then printed the same code
  // twice, once as itself and once as a section that does not exist.
  const assigned = (assessor.assigned_courses ?? [])
    .map((courseId) => courses.get(asId(courseId)))
    .filter(Boolean)
    .map((course) => ({
      id: asId(course._id),
      code: courseCode(course),
      title: courseTitle(course)
    }));

  return {
    id: asId(assessor._id),
    assessorNumber: assessor.assessor_id ?? null,
    name: assessor.full_name ?? assessor.name ?? assessor.email ?? "Unnamed assessor",
    email: assessor.email ?? null,
    students: (assessor.assigned_students ?? []).length,
    assigned,
    // Same rule as a student's: absent on every account written before the
    // field existed, so missing reads as not suspended and only an explicit
    // true locks anyone out. `loginUser` searches both collections with one
    // identifier and refuses either, so this is the same lock, not a label.
    suspended: assessor.suspended === true,
    workload: publicWorkload(tally),
    // Whichever kind of work happened last, named — the same shape a student's
    // `lastActive` carries. Posting a paper and releasing a grade are both
    // work, and reporting only the second said "has not graded anything yet"
    // about an assessor who had spent the week writing papers.
    lastActive: latestAssessorWork(tally)
  };
}

/**
 * When an assessor last did something, named.
 *
 * Posting a paper is the only kind of work left that carries a date of its own.
 * Marking is the system's now, and an issued credential is stamped on the
 * StudentResult rather than tallied per assessor — so the question this answers
 * is narrower than it was: has this person put a paper out lately.
 */
function latestAssessorWork(tally) {
  if (!tally.lastPosted) return { at: null, kind: null };
  return { at: tally.lastPosted.toISOString(), kind: "posted" };
}

/**
 * Courses nobody assesses, courses more than one person does, and courses whose
 * students have nothing to take.
 *
 * All three are problems this screen is the place to fix, and none of them is
 * visible from Course Management — a course looks the same there whether it has
 * an assessor, has three, or has one who has posted nothing.
 *
 * The third is new with the posting rule. A generated paper used to be live the
 * moment it existed, so a staffed course could not be a silent one; now that
 * releasing is a deliberate act, a course can sit fully assigned all term with
 * not one quiz its students can open.
 */
function coverageFor(assessors, courses, papers) {
  const counts = new Map();
  assessors.forEach((assessor) => {
    new Set((assessor.assigned_courses ?? []).map(asId)).forEach((courseKey) => {
      counts.set(courseKey, (counts.get(courseKey) ?? 0) + 1);
    });
  });

  const brief = (course) => ({
    id: asId(course._id),
    code: courseCode(course),
    title: courseTitle(course)
  });

  const all = [...courses.values()];

  return {
    unassigned: all.filter((course) => !counts.has(asId(course._id))).map(brief),
    shared: all
      .filter((course) => (counts.get(asId(course._id)) ?? 0) > 1)
      .map((course) => ({ ...brief(course), assessors: counts.get(asId(course._id)) })),
    // Only courses that have an assessor. One with nobody on it is the warning
    // above, and a course listed under both would just be said twice.
    unposted: all
      .filter((course) => counts.has(asId(course._id)))
      .filter((course) => (papers.get(asId(course._id))?.posted ?? 0) === 0)
      .map(brief)
  };
}

export async function listAssessors(_request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const [assessors, courses] = await Promise.all([
    collection(ASSESSORS_COLLECTION).find().sort({ full_name: 1 }).toArray(),
    courseMap()
  ]);

  const { tallies, papers } = await workloadByAssessor(assessors, courses);

  return response.json({
    assessors: assessors.map((a) => publicAssessor(a, courses, tallies.get(asId(a._id)))),
    coverage: coverageFor(assessors, courses, papers)
  });
}

/**
 * How many assessors each course is assigned to, across the whole collection.
 *
 * `coverageFor` counts the same thing for the list screen, but from the full
 * assessor documents it already has in hand. The detail screen loads one
 * assessor, so it has nothing to count from — and the number it needs is about
 * everyone else. Only the assignment lists are read back.
 */
async function assessorCountByCourse() {
  const assessors = await collection(ASSESSORS_COLLECTION)
    .find({}, { projection: { assigned_courses: 1 } })
    .toArray();

  const counts = new Map();
  assessors.forEach((assessor) => {
    // Deduped like `tallyWorkload` does it: a course listed twice on one
    // assessor is an assignment mistake, not two people on the course.
    new Set((assessor.assigned_courses ?? []).map(asId)).forEach((key) => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });

  return counts;
}

/**
 * The assigned courses, each with the work it carries.
 *
 * This is what the detail screen's second card holds. It used to re-render the
 * assigned-course list verbatim under a different heading, which told an admin
 * nothing the card beside it had not already said.
 *
 * `sharedWith` is how many OTHER assessors are on the course. Every figure in
 * the row is the course's rather than this person's — `tallyWorkload` gives
 * each owner of a course the same posted and credential counts — so on a shared
 * course "6 of 9 posted" is the course's progress, not this assessor's six. The
 * list screen already warns which courses are shared; without this the detail
 * screen is where that fact goes missing, and it is the screen where the
 * numbers get read as one person's output.
 */
async function classesFor(assessor, courses, tally, sharing = new Map()) {
  const assigned = (assessor.assigned_courses ?? [])
    .map((courseId) => courses.get(asId(courseId)))
    .filter(Boolean);
  if (assigned.length === 0) return [];

  // Enrolment counted from Student.enrolledCourses — the same way the
  // assessor's own Classes screen counts it, so the two cannot disagree.
  const students = await collection(STUDENTS_COLLECTION)
    .find({}, { projection: { enrolledCourses: 1 } })
    .toArray();

  const enrolled = new Map();
  students.forEach((student) => {
    (student.enrolledCourses ?? []).forEach((courseId) => {
      const key = asId(courseId);
      enrolled.set(key, (enrolled.get(key) ?? 0) + 1);
    });
  });

  return assigned.map((course) => {
    const key = asId(course._id);
    const row = tally.perCourse.get(key) ?? blankCourseTally();

    return {
      id: key,
      code: courseCode(course),
      title: courseTitle(course),
      students: enrolled.get(key) ?? 0,
      // Falls back to 1 — this assessor — so an unseeded map reads as unshared
      // rather than as a negative count.
      sharedWith: Math.max(0, (sharing.get(key) ?? 1) - 1),
      papersExpected: row.papersExpected,
      papersPosted: row.papersPosted,
      papersDraft: row.papersDraft,
      toPost: Math.max(0, row.papersExpected - row.papersPosted),
      credentialsPending: row.credentialsPending,
      credentialsIssued: row.credentialsIssued
    };
  });
}

export async function getAssessor(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await collection(ASSESSORS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  const [courses, sharing] = await Promise.all([courseMap(), assessorCountByCourse()]);
  const { tallies } = await workloadByAssessor([assessor], courses);
  const tally = tallies.get(asId(assessor._id)) ?? blankTally();

  return response.json({
    assessor: {
      ...publicAssessor(assessor, courses, tally),
      classes: await classesFor(assessor, courses, tally, sharing)
    }
  });
}

/* ──────────────────── Table of Specification ──────────────────── */

const LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"];

function toCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function publicTosRow(row) {
  const clean = { course: String(row?.course ?? ""), hours: toCount(row?.hours) };
  LEVELS.forEach((level) => {
    clean[level] = toCount(row?.[level]);
  });
  // The row's item count is the sum of its levels — carried so callers don't
  // each re-derive the one number the row exists to state.
  clean.items = LEVELS.reduce((sum, level) => sum + clean[level], 0);

  // `course` holds the coverage topic — a lesson title, which anyone may
  // retype here. The moduleId says which lesson that row actually covers, and
  // is preserved rather than rebuilt: a save round-trips rows through the
  // admin form, and anything dropped here is lost from the blueprint.
  if (row?.moduleId) clean.moduleId = String(row.moduleId);

  return clean;
}

function publicTos(doc) {
  return {
    id: asId(doc._id),
    courseId: doc.courseId ? String(doc.courseId) : null,
    courseCode: doc.courseCode ?? "",
    examination: doc.examination ?? "",
    rows: Array.isArray(doc.rows) ? doc.rows.map(publicTosRow) : [],
    // What the rows mean for quiz generation, derived rather than stored so it
    // can never drift from the rows beside it.
    blueprint: blueprintFromTos(doc)
  };
}

/**
 * One blueprint per course, enforced by the database rather than by whoever
 * happens to call the save.
 *
 * Keying the upsert on courseId is what makes a save land on the right
 * document, but it only holds while every document spells courseId the same
 * way. A row written as an ObjectId where the rest are strings would not match
 * the filter, so the upsert would insert a second blueprint for one course —
 * and the screen would then list the same course twice with no way to tell
 * which one generation reads.
 *
 * Best-effort on purpose. If duplicates already exist the index cannot be
 * built, and that must not stop an admin loading the page: the reason is
 * returned so a caller can surface it, and the endpoints work as before.
 */
let tosIndexChecked = false;

async function ensureTosIndex() {
  if (tosIndexChecked) return { created: false, reason: "already-checked" };
  if (!(await collectionExists(TOS_COLLECTION))) return { created: false, reason: "no-collection" };

  try {
    await collection(TOS_COLLECTION).createIndex(
      { courseId: 1 },
      { unique: true, name: "one_blueprint_per_course" }
    );
    tosIndexChecked = true;
    return { created: true, index: "one_blueprint_per_course" };
  } catch (error) {
    // Duplicates already in the data, most likely. Worth reporting, not worth
    // failing the request over — and worth retrying on the next call, once
    // whoever saw the warning has merged them.
    return { created: false, reason: error.message };
  }
}

/**
 * Every course's blueprint — one document per course, its rows being that
 * course's lessons.
 *
 * These endpoints once read a single document with no course filter, so with
 * several stored the screen showed, and a save overwrote, whichever happened
 * to sort first. Both are keyed on courseId now.
 */
export async function getTableOfSpecification(_request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  // The collection may not exist yet — respond with an empty list rather than
  // failing, same "abang" behaviour as the student endpoints.
  if (!(await collectionExists(TOS_COLLECTION))) {
    return response.json({ blueprints: [], pending: true });
  }

  await ensureTosIndex();

  const docs = await collection(TOS_COLLECTION).find({}).toArray();
  const blueprints = docs
    .map(publicTos)
    .sort((left, right) => left.examination.localeCompare(right.examination, "en"));

  return response.json({ blueprints, pending: blueprints.length === 0 });
}

export async function saveTableOfSpecification(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { courseId, examination, rows } = request.body ?? {};
  if (!Array.isArray(rows)) {
    return response.status(400).json({ message: "rows must be an array." });
  }
  // Without this a save has no course to land on, and would fall back to
  // overwriting an arbitrary one — the failure this endpoint used to have.
  if (!courseId) {
    return response.status(400).json({ message: "courseId is required." });
  }

  const payload = {
    examination: String(examination ?? "").trim(),
    rows: rows.map(publicTosRow),
    updatedAt: new Date()
  };

  try {
    await collection(TOS_COLLECTION).updateOne(
      { courseId: String(courseId) },
      { $set: payload, $setOnInsert: { courseId: String(courseId), createdAt: new Date() } },
      { upsert: true }
    );
  } catch (error) {
    // Only reachable once the unique index exists: the upsert found no document
    // to match but the insert collided, which means one is already stored under
    // a differently-typed courseId.
    if (error?.code === 11000) {
      return response.status(409).json({
        message: "This course already has a blueprint stored under a different key. Merge the duplicates before saving."
      });
    }
    throw error;
  }

  await ensureTosIndex();

  return getTableOfSpecification(request, response);
}

/* ──────────────────── Assessment generation ──────────────────── */

/**
 * Authoring endpoints, not student ones.
 *
 * Generating is the only thing in this system that spends money, and no route
 * a student can call reaches it. Every endpoint here takes `dryRun`, which
 * reports what would happen and what it would roughly cost without calling the
 * model.
 *
 * These are the bulk tool: a whole course in one press, for setting a course up
 * before its assessors arrive. Everything they write is a draft, the same as
 * anything generated on the assessor's own screen — releasing a paper to a
 * class is the assessor's act, and running the bulk job must not quietly make
 * sixty-eight of those decisions for them.
 */
export async function getAssessmentGenerationStatus(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const courseId = request.query.courseId;
  if (!courseId) return response.status(400).json({ message: "courseId is required." });

  return response.json(await getGenerationStatus(courseId));
}

/**
 * POST /api/admin/assessments/generate
 * Body: { courseId, moduleId?, dryRun? }
 *
 * With a moduleId, one lesson. Without, every lesson in the course that still
 * needs a quiz — skipping, rather than failing on, the ones that have no text.
 */
export async function generateAssessments(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { courseId, moduleId, dryRun = false } = request.body ?? {};
  if (!courseId) return response.status(400).json({ message: "courseId is required." });

  await ensureAssessmentIndexes();

  const options = { courseId, dryRun: Boolean(dryRun) };

  if (moduleId) {
    return response.json({ results: [await generateModuleAssessment({ ...options, moduleId })] });
  }

  const status = await getGenerationStatus(courseId);
  const results = [];

  // One lesson at a time on purpose. These calls are slow and paid for, and a
  // failure halfway through should leave the lessons before it stored.
  for (const row of status.rows ?? []) {
    results.push(await generateModuleAssessment({ ...options, moduleId: row.moduleId }));
  }

  return response.json({ results, summary: summariseResults(results) });
}

/** POST /api/admin/assessments/final — Body: { courseId, dryRun? } */
export async function generateFinalAssessment(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { courseId, dryRun = false } = request.body ?? {};
  if (!courseId) return response.status(400).json({ message: "courseId is required." });

  await ensureAssessmentIndexes();

  return response.json({ result: await assembleFinalAssessment({ courseId, dryRun: Boolean(dryRun) }) });
}

function summariseResults(results) {
  const counts = {};
  let inputTokens = 0;
  let outputTokens = 0;

  for (const result of results) {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    inputTokens += result.usage?.inputTokens ?? result.estimatedInputTokens ?? 0;
    outputTokens += result.usage?.outputTokens ?? 0;
  }

  return { counts, inputTokens, outputTokens };
}

/* ─────────────────────────── Profile ─────────────────────────── */

/**
 * The admin who is signed in — not whichever one sorts first.
 *
 * This read `findOne()` with no filter, so with a single account in the
 * collection it was right by accident. A second admin and the sidebar would
 * greet both of them by the same name. The session already knows who is
 * calling, so it is the session that decides.
 */
export async function getAdminProfile(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const admin = await collection(ADMIN_COLLECTION).findOne({
    _id: { $in: idCandidates(request.session?.id) }
  });

  // The token verified, so the account existed when it was issued. Finding
  // nothing now means it was deleted mid-session, and carrying on as a nameless
  // administrator would hide that.
  if (!admin) {
    return response.status(401).json({ message: "This account no longer exists." });
  }

  return response.json({
    admin: {
      name: admin.name ?? admin.full_name ?? admin.email ?? "Administrator",
      idNumber: admin.admin_id ?? "",
      email: admin.email ?? null
    }
  });
}
