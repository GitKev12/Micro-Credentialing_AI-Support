import mongoose from "mongoose";
import { idCandidates } from "../lib/mongo.js";
import {
  DEFAULT_POINTS_PER_ITEM,
  credentialNameFor,
  defaultPassMark,
  isPosted
} from "../assessments/assessments.format.js";
import { FINAL_ATTEMPT_LIMIT, attemptsUsedFrom } from "../assessments/assessments.controller.js";
import { buildStudentBadges, passedFromResults } from "../badges/badges.service.js";
import { issueCertificate, listIssuedCertificates } from "../certificates/certificates.service.js";
import { SKILL_THRESHOLD, buildStudentSkillGap } from "../skillgap/skillgap.service.js";
import { papersByCourse } from "../assessments/papers.js";
import { scoreOf } from "./grading.js";
import { loadAuthoringRestrictions, loadClassesByCourse } from "../lib/courseAccess.js";
import { readSuspendedFlag } from "../lib/suspension.js";
import { toIsoDay } from "../lib/courseDates.js";
import { sortLessons } from "../lib/lessonOrder.js";

/**
 * Assessor console endpoints — classes, roster, student detail and credential
 * release.
 *
 * There is no grading here any more. A paper is marked against its key the
 * moment it is handed in and that mark stands, so the console never reopens a
 * submission to re-mark it: what an assessor does is write papers, post them,
 * and decide which passes become credentials.
 *
 * These read the live MainSystemDB collections:
 *
 * Assessment — one generated quiz per module:
 *   { moduleId, courseId, title, credentialName?, pointsPerItem, totalPoints,
 *     passMark, source, items: [{ id, n, q, choices, key }] }
 *
 * StudentResult — one submission per student per assessment:
 *   { assessmentId, moduleId, courseId, studentId, submittedAt, durationMs,
 *     answers: [{ itemId, choice }],
 *     aiGrading: { status: "graded", score,
 *                  items: [{ itemId, verdict: "correct"|"incorrect" }] },
 *     credential: { status: "none"|"pending"|"issued", name, issuedAt, issuedBy } }
 *
 * A passed final writes its own `credential.status: "pending"`, so the
 * Credentials screen fills without anyone grading anything. Only the final: a
 * lesson quiz earns a badge, which is the student's on passing and never
 * reaches this screen. Everything shown is derived from real documents:
 *
 *   class.lessons    <- LearningModules published for that course
 *   class.posted     <- Assessments released to that course
 *   roster.done      <- ModuleProgress completions for that course
 *   roster.creds     <- issued credentials on StudentResults
 *   summary.toPost   <- papers not yet released across assigned courses
 */
const ASSESSORS_COLLECTION = "Assessor";
const ASSESSMENTS_COLLECTION = "Assessment";
const CLASSES_COLLECTION = "Class";
const COURSES_COLLECTION = "Course";
const MODULES_COLLECTION = "LearningModule";
const PROGRESS_COLLECTION = "ModuleProgress";
const RESULTS_COLLECTION = "StudentResult";
const STUDENTS_COLLECTION = "Student";

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

const manyCandidates = (values) => values.flatMap((value) => idCandidates(value));

export function courseTitle(course) {
  return course?.courseName ?? course?.title ?? course?.name ?? "";
}

export function courseCode(course) {
  return (course?.courseCode ?? course?.code ?? "").trim();
}

export function studentName(student) {
  const full = [student?.first_name, student?.last_name].filter(Boolean).join(" ").trim();
  return full || student?.full_name || student?.name || student?.email || "Unnamed student";
}

/**
 * The same student written surname first: "Dayan, Chris Jerome".
 *
 * For a list read down the column to find one person. Alphabetical by class
 * means alphabetical by surname, and writing the given name first would put
 * the thing the list is ordered by in the middle of the cell, where the eye
 * cannot run down it.
 *
 * Falls back to the ordinary name unless both halves are on record — "Cruz,"
 * with nothing after it reads as a fault rather than as a name.
 */
export function surnameFirst(student) {
  const last = String(student?.last_name ?? "").trim();
  const first = String(student?.first_name ?? "").trim();
  if (!last || !first) return studentName(student);

  return `${last}, ${first}`;
}

/** Assessors sign in with either their Mongo id or their ASS### number. */
export async function findAssessor(idOrNumber) {
  return collection(ASSESSORS_COLLECTION).findOne({
    $or: [{ _id: { $in: idCandidates(idOrNumber) } }, { assessor_id: String(idOrNumber) }]
  });
}

export async function coursesForAssessor(assessor) {
  const assigned = assessor.assigned_courses ?? [];
  if (assigned.length === 0) return [];
  return collection(COURSES_COLLECTION)
    .find({ _id: { $in: manyCandidates(assigned) } })
    .toArray();
}

export function moduleFilterForCourse(course) {
  return {
    $or: [{ courseId: { $in: idCandidates(course._id) } }, { courseCode: courseCode(course) }]
  };
}

async function resultsForCourses(courses) {
  if (courses.length === 0) return [];

  // Superseded attempts are history, not work. A lesson quiz may be retaken
  // without limit, so grading every sitting would let one student add rows to
  // the queue indefinitely — and the earlier attempts no longer decide
  // anything, because the latest is the one that counts.
  return collection(RESULTS_COLLECTION)
    .find({
      courseId: { $in: manyCandidates(courses.map((course) => course._id)) },
      superseded: { $ne: true }
    })
    .toArray();
}

/**
 * What a paper is worth: one point per question, over every question on it.
 *
 * Derived rather than read off the document. A paper written while assessments
 * still held a bank carries a `totalPoints` for the shorter paper that used to
 * be drawn out of it, and marking today's attempt against that number would
 * put a student's score over the total.
 */
function paperConfig(assessment) {
  const pointsPerItem = assessment?.pointsPerItem ?? DEFAULT_POINTS_PER_ITEM;
  const total = pointsPerItem * (assessment?.items ?? []).length;
  return { pointsPerItem, total, passMark: defaultPassMark(total) };
}

/** Students keyed by string id, for resolving submission references. */
async function studentMap() {
  const students = await collection(STUDENTS_COLLECTION).find().toArray();
  return new Map(students.map((student) => [asId(student._id), student]));
}

async function assessmentMap(results) {
  const ids = [...new Set(results.map((result) => asId(result.assessmentId)))];
  if (ids.length === 0) return new Map();
  const assessments = await collection(ASSESSMENTS_COLLECTION)
    .find({ _id: { $in: manyCandidates(ids) } })
    .toArray();
  return new Map(assessments.map((assessment) => [asId(assessment._id), assessment]));
}

/* ─────────────────────────── Overview ─────────────────────────── */

export async function getOverview(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  // Resolved and checked against the session by requireOwnAssessor.
  const assessor = request.assessor;

  const courses = await coursesForAssessor(assessor);
  const [results, lessonCounts, assessments] = await Promise.all([
    resultsForCourses(courses),
    lessonCountsForCourses(courses),
    assessmentsForCourses(courses)
  ]);

  // What the rail's "Generate Assessment" badge counts: papers this assessor's
  // classes are still waiting on, added up across them. The same sum the admin
  // console reports about this assessor, because it is the same function —
  // see assessments/papers.js for what happened when it was two.
  const papers = papersByCourse(assessments, lessonCounts);
  const toPost = [...papers.values()].reduce((sum, row) => sum + row.toPost, 0);

  return response.json({
    assessor: {
      id: asId(assessor._id),
      idNumber: assessor.assessor_id ?? "",
      name: assessor.full_name ?? assessor.name ?? assessor.email ?? "Unnamed assessor",
      email: assessor.email ?? null
    },
    summary: {
      toPost,
      credentials: results.filter(
        (result) => result.credential?.status === "pending"
      ).length
    }
  });
}

/* ─────────────────────────── Classes ─────────────────────────── */

/**
 * Lessons per course, in one query rather than one per course.
 *
 * A LearningModule names its course by id or by course code — the same pair
 * moduleFilterForCourse accepts — so both forms are resolved back to the course
 * document here.
 */
async function lessonCountsForCourses(courses) {
  const counts = new Map(courses.map((course) => [asId(course._id), 0]));
  if (courses.length === 0) return counts;

  const codes = [...new Set(courses.map(courseCode).filter(Boolean))];
  const modules = await collection(MODULES_COLLECTION)
    .find(
      {
        $or: [
          { courseId: { $in: manyCandidates(courses.map((course) => course._id)) } },
          ...(codes.length
            ? [{ courseCode: { $in: codes.flatMap((code) => [code, code.toUpperCase()]) } }]
            : [])
        ]
      },
      { projection: { courseId: 1, courseCode: 1 } }
    )
    .toArray();

  const byCode = new Map(
    courses
      .filter((course) => courseCode(course))
      .map((course) => [courseCode(course).toLowerCase(), asId(course._id)])
  );

  modules.forEach((module) => {
    const key = counts.has(asId(module.courseId))
      ? asId(module.courseId)
      : byCode.get(String(module.courseCode ?? "").trim().toLowerCase());
    if (key && counts.has(key)) counts.set(key, counts.get(key) + 1);
  });

  return counts;
}

/**
 * Every assessment written for these courses, drafts included.
 *
 * Both the overview and the register report on what has been posted, and both
 * need the same read.
 */
async function assessmentsForCourses(courses) {
  if (courses.length === 0) return [];
  return collection(ASSESSMENTS_COLLECTION)
    .find(
      { courseId: { $in: manyCandidates(courses.map((course) => course._id)) } },
      { projection: { courseId: 1, moduleId: 1, scope: 1, status: 1 } }
    )
    .toArray();
}

/** Submissions per course, counting only the ones the predicate keeps. */
function countByCourse(results, predicate) {
  const counts = new Map();
  results.filter(predicate).forEach((result) => {
    const key = asId(result.courseId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

/**
 * One row per assigned course, with everything the Classes table shows.
 *
 * The screen is a register, not a set of shortcuts: it answers how big the
 * class is, how far it has read, how many of its papers are out, how many
 * credentials have come out of it, and when the class was last heard from —
 * all derived from the live collections, so an empty database reports zeroes
 * rather than failing.
 */
export async function getClasses(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  // Resolved and checked against the session by requireOwnAssessor.
  const assessor = request.assessor;

  const courses = await coursesForAssessor(assessor);
  const [results, lessonCounts, students, assessments, closedCourses, classesByCourse] =
    await Promise.all([
    resultsForCourses(courses),
    lessonCountsForCourses(courses),
    collection(STUDENTS_COLLECTION).find({}, { projection: { enrolledCourses: 1 } }).toArray(),
    assessmentsForCourses(courses),
    // A course whose run is over, or whose classes have all been switched off,
    // can still be read but can no longer be written for. The register is
    // where an assessor decides what to work on next, so it is where that
    // belongs — otherwise the first sign is a refusal on the generate screen.
    loadAuthoringRestrictions(courses),
    loadClassesByCourse(courses)
  ]);

  // Enrollment counts per course, derived from Student.enrolledCourses.
  const studentCounts = new Map();
  students.forEach((student) => {
    (student.enrolledCourses ?? []).forEach((courseId) => {
      const key = asId(courseId);
      studentCounts.set(key, (studentCounts.get(key) ?? 0) + 1);
    });
  });

  // Papers written and papers released, per course. The register's job is to
  // say what a class is still waiting on, and a draft nobody has posted is
  // waiting exactly as much as a lesson with no quiz at all.
  const papers = papersByCourse(assessments, lessonCounts);

  const credentialsPending = countByCourse(
    results,
    (result) => result.credential?.status === "pending"
  );
  const credentialsIssued = countByCourse(
    results,
    (result) => result.credential?.status === "issued"
  );

  // The newest submission in each course — how recently the class was active.
  const lastSubmission = new Map();
  results.forEach((result) => {
    if (!result.submittedAt) return;
    const key = asId(result.courseId);
    const current = lastSubmission.get(key);
    if (!current || new Date(result.submittedAt) > new Date(current)) {
      lastSubmission.set(key, result.submittedAt);
    }
  });

  return response.json({
    classes: courses.map((course) => {
      const key = asId(course._id);

      return {
        id: key,
        code: courseCode(course),
        name: courseTitle(course),
        // Sections are not stored on the Course document yet.
        section: course.section ?? null,
        students: studentCounts.get(key) ?? 0,
        lessons: lessonCounts.get(key) ?? 0,
        // When the course runs — the register's duration column.
        startsOn: toIsoDay(course.startsOn),
        endsOn: toIsoDay(course.endsOn),
        // Null while it is open to new papers.
        closed: closedCourses.get(key) ?? null,
        // The classes this course is taught through. A course can carry more
        // than one, and the register used to show it as a single row with no
        // sign of that — an assessor reading "24 students" could not tell it
        // was two classes of twelve.
        classes: (classesByCourse.get(key) ?? []).map((cls) => ({
          id: asId(cls._id),
          name: cls.name ?? "Unnamed class",
          active: cls.active !== false,
          students: (cls.studentIds ?? []).length
        })),
        // One paper per lesson, plus the course's final.
        assessmentsExpected: papers.get(key)?.expected ?? 0,
        assessmentsWritten: papers.get(key)?.written ?? 0,
        assessmentsPosted: papers.get(key)?.posted ?? 0,
        finalPosted: papers.get(key)?.finalPosted ?? false,
        credentialsPending: credentialsPending.get(key) ?? 0,
        credentialsIssued: credentialsIssued.get(key) ?? 0,
        lastSubmission: lastSubmission.get(key) ?? null
      };
    })
  });
}

/** The course from the route, but only if it is assigned to this assessor. */
export async function findAssignedCourse(assessor, courseId) {
  const courses = await coursesForAssessor(assessor);
  return courses.find((course) => idCandidates(courseId).some((id) => asId(id) === asId(course._id))) ?? null;
}

/* ─────────────────────────── Roster ─────────────────────────── */

export async function getRoster(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  // Resolved and checked against the session by requireOwnAssessor.
  const assessor = request.assessor;

  const course = await findAssignedCourse(assessor, request.params.courseId);
  if (!course) return response.status(404).json({ message: "Course not found for this assessor." });

  const [students, totalModules, results, progress, classesByCourse] = await Promise.all([
    collection(STUDENTS_COLLECTION)
      .find({ enrolledCourses: { $in: idCandidates(course._id) } })
      .sort({ last_name: 1 })
      .toArray(),
    collection(MODULES_COLLECTION).countDocuments(moduleFilterForCourse(course)),
    resultsForCourses([course]),
    collection(PROGRESS_COLLECTION)
      .find({ courseId: { $in: idCandidates(course._id) } })
      .toArray(),
    // Which class each student sits in. Enrolment is written through from the
    // classes, so the two agree on *who* is here — what the class adds is
    // *which one*, and that is the whole question on a course taught through
    // more than one.
    loadClassesByCourse([course])
  ]);

  const classesByStudent = new Map();
  // Whose access to this course the assessor has closed. Read off the same
  // class rows as the names above, so the column costs no extra query.
  const closedHere = new Set();
  for (const cls of classesByCourse.get(asId(course._id)) ?? []) {
    for (const studentId of cls.studentIds ?? []) {
      const key = asId(studentId);
      if (!classesByStudent.has(key)) classesByStudent.set(key, []);
      classesByStudent.get(key).push(cls.name ?? "Unnamed class");
    }
    for (const studentId of cls.suspendedStudentIds ?? []) closedHere.add(asId(studentId));
  }

  const doneByStudent = new Map();
  progress.forEach((entry) => {
    const key = asId(entry.studentId);
    doneByStudent.set(key, (doneByStudent.get(key) ?? 0) + 1);
  });

  // Credentials this student already holds. Nothing here counts what is
  // still to be issued: that is a queue and it belongs on the Credentials
  // screen, which is where the assessor acts on it.
  const credsByStudent = new Map();
  results.forEach((result) => {
    if (result.credential?.status !== "issued") return;
    const key = asId(result.studentId);
    credsByStudent.set(key, (credsByStudent.get(key) ?? 0) + 1);
  });

  return response.json({
    course: {
      id: asId(course._id),
      code: courseCode(course),
      name: courseTitle(course),
      section: course.section ?? null
    },
    totalModules,
    // The classes this course is taught through, so the roster can say which
    // one it is showing rather than presenting two as one list.
    classes: (classesByCourse.get(asId(course._id)) ?? []).map((cls) => ({
      id: asId(cls._id),
      name: cls.name ?? "Unnamed class",
      active: cls.active !== false,
      students: (cls.studentIds ?? []).length
    })),
    roster: students.map((student) => ({
      id: asId(student._id),
      name: studentName(student),
      sid: student.student_id ?? null,
      // Empty for a student enrolled outside a class — seeded rows, or ones a
      // deleted class left behind. Naming that is better than implying a class
      // they are not in.
      classes: classesByStudent.get(asId(student._id)) ?? [],
      done: doneByStudent.get(asId(student._id)) ?? 0,
      creds: credsByStudent.get(asId(student._id)) ?? 0,
      // Their place in *this* course, not their account. The admin's own
      // suspension stops somebody signing in at all and is not this column's
      // business — an assessor closes a course, not a person's login.
      suspended: closedHere.has(asId(student._id))
    }))
  });
}

/**
 * PATCH .../classes/:courseId/students/:studentId/suspension — close this
 * course to one student, or open it again.
 *
 * Course access, not a login control. It shuts the same amount as switching
 * their class off does — the lessons, the quizzes and the tick that completes a
 * lesson are all refused (lib/courseAccess.js) — and it shuts it for this
 * course only. The student still signs in, still has their other courses, and
 * keeps their enrolment, their progress and every badge they have earned here;
 * turning it back on restores them exactly as they were.
 *
 * That is a different thing from the admin console's suspension, which is on
 * the account and stops the person signing in at all (lib/suspension.js). An
 * assessor owns a course, not an account, so this is the one they get.
 *
 * It is recorded on the class rather than on the student, because the class is
 * what puts them in the course: `Class.suspendedStudentIds` is a subset of its
 * own `studentIds`, so it cannot name somebody who is not there, it travels
 * with the class when the class is deleted, and the gate already holds the
 * class documents when it asks.
 *
 * What makes this safe to hand an assessor is the enrolment clause below. The
 * guard on the route says the :assessorId is theirs; this says the student is
 * one of theirs to act on. Anyone else answers 404 — the same reply as a
 * student who does not exist, so the endpoint cannot be walked to find out who
 * is on somebody else's roster.
 */
export async function setRosterStudentSuspension(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  // Resolved and checked against the session by requireOwnAssessor.
  const assessor = request.assessor;

  const suspended = readSuspendedFlag(request.body);
  if (suspended === null) {
    return response.status(400).json({ message: "Send suspended: true or false." });
  }

  const course = await findAssignedCourse(assessor, request.params.courseId);
  if (!course) return response.status(404).json({ message: "Course not found for this assessor." });

  const student = await collection(STUDENTS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.studentId) },
    enrolledCourses: { $in: idCandidates(course._id) }
  });
  if (!student) {
    return response.status(404).json({ message: "Student not found in this course." });
  }

  // A student belongs to one class per course, so there is one row to write.
  // An enrolment with no class behind it predates that rule and has nowhere to
  // record this — said plainly rather than answered with a silent success.
  const cls = await collection(CLASSES_COLLECTION).findOne({
    courseId: { $in: idCandidates(course._id) },
    studentIds: { $in: idCandidates(student._id) }
  });
  if (!cls) {
    return response.status(409).json({
      message: "This student is on the course without a class, so there is nothing to close."
    });
  }

  await collection(CLASSES_COLLECTION).updateOne(
    { _id: cls._id },
    suspended
      ? { $addToSet: { suspendedStudentIds: student._id } }
      : { $pull: { suspendedStudentIds: { $in: idCandidates(student._id) } } }
  );

  return response.json({
    student: { id: asId(student._id), name: studentName(student), suspended }
  });
}

/* ───────────────────────── Credentials ───────────────────────── */

/**
 * A StudentResult from the route, but only inside this assessor's courses.
 *
 * All that is left of reaching one submission: issuing its credential. The
 * assessor no longer opens a handed-in paper to re-mark it, so this is a check
 * on whose course a paper belongs to rather than the front door of a review
 * screen.
 */
async function findAssignedResult(assessor, submissionId) {
  const result = await collection(RESULTS_COLLECTION).findOne({
    _id: { $in: idCandidates(submissionId) }
  });
  if (!result) return { result: null, course: null };

  const course = await findAssignedCourse(assessor, result.courseId);
  return { result: course ? result : null, course };
}

export async function getPendingCredentials(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  // Resolved and checked against the session by requireOwnAssessor.
  const assessor = request.assessor;

  const courses = await coursesForAssessor(assessor);
  const courseById = new Map(courses.map((course) => [asId(course._id), course]));

  const results = (await resultsForCourses(courses)).filter(
    (result) => result.credential?.status === "pending"
  );

  const [students, assessments] = await Promise.all([studentMap(), assessmentMap(results)]);

  return response.json({
    pendingCredentials: results.map((result) => {
      const student = students.get(asId(result.studentId));
      const assessment = assessments.get(asId(result.assessmentId));
      const course = courseById.get(asId(result.courseId));
      const config = paperConfig(assessment);

      return {
        id: asId(result._id),
        studentId: asId(result.studentId),
        name: studentName(student),
        sid: student?.student_id ?? null,
        credential: result.credential?.name ?? credentialNameFor(assessment),
        courseCode: courseCode(course),
        assessmentTitle: assessment?.title ?? "Assessment",
        score: scoreOf(result),
        totalPoints: config.total,
        passMark: config.passMark,
        submittedAt: result.submittedAt ?? null
      };
    })
  });
}

export async function issueCredential(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  // Resolved and checked against the session by requireOwnAssessor.
  const assessor = request.assessor;

  const { result } = await findAssignedResult(assessor, request.params.submissionId);
  if (!result) return response.status(404).json({ message: "Submission not found." });

  if (result.credential?.status !== "pending") {
    return response.status(409).json({ message: "This submission has no credential awaiting release." });
  }

  const issuedAt = new Date();

  await collection(RESULTS_COLLECTION).updateOne(
    { _id: result._id },
    {
      $set: {
        "credential.status": "issued",
        "credential.issuedAt": issuedAt,
        "credential.issuedBy": asId(assessor._id)
      }
    }
  );

  // Stamp the printable certificate from this release. The credential above is
  // the record; this is the artefact the student downloads, so a failure here
  // must not un-issue the credential — it is reported and can be retried.
  let certificate = null;
  let certificateError = null;

  try {
    certificate = await issueStudentCertificate({
      result,
      assessor,
      issuedAt,
      credentialName:
        result.credential?.name ??
        credentialNameFor((await assessmentMap([result])).get(asId(result.assessmentId)))
    });
  } catch (error) {
    certificateError = error.message;
  }

  return response.json({
    credential: {
      id: asId(result._id),
      name: result.credential?.name ?? null,
      status: "issued",
      issuedAt
    },
    certificate: certificate
      ? { id: asId(certificate._id), filename: certificate.filename }
      : null,
    certificateError
  });
}

/**
 * Fills the blank certificate for the student behind one released submission.
 *
 * Everything printed is read back from the records rather than passed in, so
 * the sheet can only ever say what the database already says.
 */
async function issueStudentCertificate({ result, assessor, issuedAt, credentialName: name }) {
  const [student, course] = await Promise.all([
    collection(STUDENTS_COLLECTION).findOne({ _id: { $in: idCandidates(result.studentId) } }),
    collection(COURSES_COLLECTION).findOne({ _id: { $in: idCandidates(result.courseId) } })
  ]);

  if (!student) throw new Error("Student not found for this submission.");

  return issueCertificate({
    student,
    course,
    assessor: { name: assessor.full_name ?? assessor.name ?? assessor.assessor_id ?? "" },
    submissionId: asId(result._id),
    credentialName: name,
    issuedAt
  });
}

/* ─────────────────────────── Student detail ─────────────────────────── */

export async function getStudentDetail(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  // Resolved and checked against the session by requireOwnAssessor.
  const assessor = request.assessor;

  const course = await findAssignedCourse(assessor, request.params.courseId);
  if (!course) return response.status(404).json({ message: "Course not found for this assessor." });

  const student = await collection(STUDENTS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.studentId) }
  });
  if (!student) return response.status(404).json({ message: "Student not found." });

  const [modules, results, progress] = await Promise.all([
    collection(MODULES_COLLECTION).find(moduleFilterForCourse(course)).toArray(),
    collection(RESULTS_COLLECTION)
      .find({
        courseId: { $in: idCandidates(course._id) },
        studentId: { $in: idCandidates(student._id) }
      })
      .toArray(),
    collection(PROGRESS_COLLECTION)
      .find({
        courseId: { $in: idCandidates(course._id) },
        studentId: { $in: idCandidates(student._id) }
      })
      .toArray()
  ]);

  sortLessons(modules);

  // The attempt that counts. A quiz may be retaken without limit and a final
  // three times; every attempt is kept, but only the live one is the student's
  // record — keying the map off all of them let whichever row happened to load
  // last decide what the screen said.
  const liveResults = results.filter((result) => result.superseded !== true);

  // Every attempt is kept — a superseded row is history, not waste — so how
  // many times a paper was taken is a count of all its rows, and the live list
  // above cannot answer it. Grouped by paper rather than by lesson: the retake
  // limit is the paper's, and a lesson whose quiz was regenerated starts its
  // count again with the new one, which is what the student is told too.
  const attemptsByAssessment = new Map();
  for (const result of results) {
    const key = asId(result.assessmentId);
    if (!attemptsByAssessment.has(key)) attemptsByAssessment.set(key, []);
    attemptsByAssessment.get(key).push(result);
  }

  const takesOf = (result) =>
    result ? attemptsUsedFrom(attemptsByAssessment.get(asId(result.assessmentId)), result) : 0;

  const assessments = await assessmentMap(results);
  const resultByModule = new Map(liveResults.map((result) => [asId(result.moduleId), result]));
  const readModules = new Set(progress.map((entry) => asId(entry.moduleId)));

  const moduleRows = modules.map((module, index) => {
    const result = resultByModule.get(asId(module._id));
    const assessment = result ? assessments.get(asId(result.assessmentId)) : null;
    const config = paperConfig(assessment);

    // Taken or not taken. There is no third state now that a handed-in paper
    // is marked on the spot rather than queued for someone.
    const state = result ? "done" : "locked";

    return {
      n: index + 1,
      moduleId: asId(module._id),
      // Which paper the score came off, so the row can open it. Null on a
      // lesson nobody has taken — there is a quiz there, but no attempt at it
      // to read, and this names the one that was marked rather than the one
      // that stands now.
      assessmentId: result ? asId(result.assessmentId) : null,
      title: module.title ?? module.fileName ?? "Untitled module",
      state,
      read: readModules.has(asId(module._id)),
      score: result ? scoreOf(result) : null,
      total: result ? config.total : null,
      // How long it took, and the clock it was given. The limit is the
      // assessor's to set and most papers have none, so it is null far more
      // often than not — the screen reads the time on its own then.
      durationMs: result?.durationMs ?? null,
      timeLimitMinutes: assessment?.timeLimitMinutes ?? null,
      // How many times this quiz has been taken, retakes included. A lesson
      // quiz may be taken again without limit, so this has no ceiling to
      // report alongside it — only the final does.
      attemptsUsed: takesOf(result),
      submissionId: result ? asId(result._id) : null,
      submittedAt: result?.submittedAt ?? null
    };
  });

  // The final, which is not a lesson and does not belong in the numbered list.
  // It is reported whether or not one has been written yet: every course owes
  // one, and a course still missing its final is worth seeing on the row where
  // its result would go.
  const finalDoc = await collection(ASSESSMENTS_COLLECTION).findOne({
    courseId: { $in: idCandidates(course._id) },
    scope: "final"
  });

  const finalResult = finalDoc
    ? (liveResults.find((result) => asId(result.assessmentId) === asId(finalDoc._id)) ?? null)
    : null;
  const finalConfig = paperConfig(finalDoc);

  const finalRow = {
    assessmentId: finalDoc ? asId(finalDoc._id) : null,
    title: finalDoc?.title ?? "Final Exam",
    state: finalResult ? "done" : "locked",
    score: finalResult ? scoreOf(finalResult) : null,
    total: finalResult ? finalConfig.total : null,
    durationMs: finalResult?.durationMs ?? null,
    timeLimitMinutes: finalDoc?.timeLimitMinutes ?? null,
    submissionId: finalResult ? asId(finalResult._id) : null,
    submittedAt: finalResult?.submittedAt ?? null,
    // The final is the one paper with a ceiling on how often it may be taken,
    // so the row carries both which take this was and how many have gone.
    attempt: finalResult ? Number(finalResult.attempt ?? 1) : 0,
    attemptsUsed: takesOf(finalResult),
    attemptsAllowed: FINAL_ATTEMPT_LIMIT,
    // Written but not released is a real state, and it is the assessor's own
    // to act on — the row should not read as "not taken" when nobody could
    // have taken it.
    posted: isPosted(finalDoc)
  };

  // Badges, by the one rule the student's own badge wall uses: a lesson quiz
  // passed earns that lesson's badge. Counted against this course's lessons,
  // since the badge catalog holds one badge per lesson.
  const moduleIds = new Set(modules.map((module) => asId(module._id)));
  const passedLessons = [...passedFromResults(results, assessments).keys()].filter((moduleId) =>
    moduleIds.has(moduleId)
  );

  // The badges themselves, from the catalog: this course's artwork, one badge
  // per lesson, earned ones marked. Built by the module the student's own
  // badge wall reads, so the assessor and the student are shown the same wall
  // — and the count above falls back to the lessons only when the catalog has
  // no row for this course.
  const badgeWall = (await buildStudentBadges(student._id, student, [course])).map((badge) => ({
    id: badge.id,
    moduleId: badge.moduleId,
    name: badge.name,
    icon: badge.icon,
    iconType: badge.iconType,
    order: badge.order,
    earned: badge.earned,
    earnedAt: badge.earnedAt
  }));

  // The final exam read one lesson at a time — the same breakdown the student
  // is shown, built by the same service, so an assessor looking at a weak
  // topic is looking at the row the student was told about. Absent until the
  // final has been taken: a lesson nobody has been examined on is not a gap.
  const [courseSkillGap] = await buildStudentSkillGap(student._id, [course]);

  // The stamped certificates this student holds for this course, paired to the
  // release each was printed from. The sheet is the record — the assessor can
  // open what the student was actually given rather than take a row's word.
  const certificateBySubmission = new Map(
    (await listIssuedCertificates(student._id))
      .filter(
        (certificate) =>
          certificate.submissionId && asId(certificate.courseId) === asId(course._id)
      )
      .map((certificate) => [asId(certificate.submissionId), certificate])
  );

  const credentials = results
    .filter((result) => ["pending", "issued"].includes(result.credential?.status))
    .map((result) => {
      const certificate = certificateBySubmission.get(asId(result._id)) ?? null;

      return {
        name: result.credential?.name ?? credentialNameFor(assessments.get(asId(result.assessmentId))),
        status: result.credential?.status,
        issuedAt: result.credential?.issuedAt ?? null,
        submissionId: asId(result._id),
        certificate: certificate
          ? {
              id: certificate.id,
              title: certificate.title ?? null,
              filename: certificate.filename ?? null,
              issuedBy: certificate.issuedBy ?? null,
              issuedAt: certificate.issuedAt ?? null
            }
          : null
      };
    });

  return response.json({
    student: {
      id: asId(student._id),
      name: studentName(student),
      sid: student.student_id ?? null,
      email: student.email ?? null,
      // The admin console's own wording: an account is Suspended or Active,
      // and a row that never carried the field reads as active.
      suspended: student.suspended === true
    },
    course: {
      id: asId(course._id),
      code: courseCode(course),
      name: courseTitle(course),
      section: course.section ?? null
    },
    totalModules: modules.length,
    skillGap: courseSkillGap
      ? {
          threshold: SKILL_THRESHOLD,
          performance: courseSkillGap.performance,
          itemsAsked: courseSkillGap.itemsAsked,
          itemsCorrect: courseSkillGap.itemsCorrect,
          skills: courseSkillGap.skills.map((skill) => ({
            moduleId: skill.moduleId,
            topic: skill.topic,
            score: skill.score,
            correct: skill.correct,
            total: skill.total,
            label: skill.label
          }))
        }
      : null,
    badges: {
      earned: badgeWall.length
        ? badgeWall.filter((badge) => badge.earned).length
        : passedLessons.length,
      total: badgeWall.length || modules.length,
      items: badgeWall
    },
    modules: moduleRows,
    final: finalRow,
    credentials
  });
}
