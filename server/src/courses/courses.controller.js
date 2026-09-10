import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { toAssessmentSummary } from "../assessments/assessments.format.js";
import { passedResult } from "../assessors/grading.js";
import { buildStudentBadges } from "../badges/badges.service.js";
import { buildStudentSkillGap } from "../skillgap/skillgap.service.js";
import { listIssuedCertificates } from "../certificates/certificates.service.js";
import { toIsoDay } from "../lib/courseDates.js";
import { loadStudentSuspensions, toCourseAccess } from "../lib/courseAccess.js";

/**
 * "Abang" — lookout endpoints that wait for their collections.
 *
 * The collections aren't set up yet, so instead of erroring these respond
 * gracefully with an empty list (and `pending: true`) until the collection
 * exists. Once the collection is created with documents linked to a student,
 * the endpoint immediately starts serving real data — no route changes needed.
 *
 * Enrollment model: the Student document carries the enrollment, e.g.
 *   { _id, student_id, enrolledCourses: [<Course _id>, ...] }
 * and each Course document looks like (flexible — common field names accepted):
 *   { _id, courseCode, courseName, description, imageUrl }
 *
 * Skill gap analysis used to wait on a CoursePerformance collection that nobody
 * ever wrote to. It is computed from the student's final exams now — see
 * skillgap.service.js — so there is no third collection to seed and no way for
 * a stored figure to fall out of step with the grade it came from.
 */
const STUDENTS_COLLECTION = "Student";
const COURSES_COLLECTION = "Course";
const MODULES_COLLECTION = "LearningModule";
const PROGRESS_COLLECTION = "ModuleProgress";
const RESULTS_COLLECTION = "StudentResult";
const ASSESSMENTS_COLLECTION = "Assessment";

function courseCodeOf(course) {
  return String(course.code ?? course.courseCode ?? course.course_code ?? "").trim();
}

function toPublicCourse(course, progress, suspension = null) {
  return {
    id: course._id,
    code: courseCodeOf(course),
    title: course.title ?? course.courseName ?? course.name ?? course.course_name ?? "",
    description: course.description ?? "",
    // When the course runs, whether that run is over, and whether the class
    // holding this student in it has been switched off. `ended` marks the card
    // read-only and `suspended` shuts it — one rule, enforced on every endpoint
    // that serves or writes to this course (see courseAccess.js).
    ...toCourseAccess(course, new Date(), suspension),
    imageUrl: course.imageUrl ?? course.image_url ?? null,
    // Set when a picture is stored in the CourseImage bucket — the client
    // then loads GET /api/courses/:id/image.
    hasImage: Boolean(course.imageFileId),
    // Changes whenever the picture does, so a replaced image is fetched again
    // rather than served from yesterday's cache.
    imageUpdatedAt: toIsoDay(course.imageUpdatedAt),
    ...progress
  };
}

/**
 * Where the student stands in one course.
 *
 * A course is not only its lessons. It is a quiz for each of them and one final
 * at the end, all three worked through in the same rail — so counting only the
 * reading put a student at 100% with every paper still to sit.
 *
 * The denominator is what a course *owes* rather than what has been posted so
 * far: one paper per lesson plus the final, which is the same total
 * papersByCourse holds an assessor to. Counting only released papers would make
 * the figure fall each time an assessor posted another one, and a percentage
 * that drops for something the student did not do is worse than one that starts
 * low.
 *
 * Status is still derived rather than stored, so the "My Courses" card can
 * never drift from what the student has actually done: a course is completed
 * once every lesson is read, every lesson quiz passed and the final passed; in
 * progress from the first of those; not started before that. A course with no
 * lessons published yet reports nothing to do — the client says so rather than
 * showing a 0% bar.
 *
 * The student's rail runs this same sum on its own copy of the data (see
 * LearningModules.jsx). They must agree; change them together.
 */
export function progressSummary(moduleCount, completedModules, passedQuizzes = 0, finalPassed = false) {
  const lessons = Math.max(0, moduleCount);
  const lessonsDone = Math.max(0, Math.min(completedModules, lessons));
  // One quiz per lesson, so no more of them can be passed than there are.
  const quizzesDone = Math.max(0, Math.min(passedQuizzes, lessons));

  // A course with no lessons owes nothing yet — not even a final.
  const itemCount = lessons ? lessons * 2 + 1 : 0;
  const completedItems = Math.min(lessonsDone + quizzesDone + (finalPassed ? 1 : 0), itemCount);

  return {
    // The lessons on their own, still, for anything that counts reading rather
    // than progress through the course.
    moduleCount: lessons,
    completedModules: lessonsDone,
    // The whole course: its lessons, their quizzes, and the final.
    itemCount,
    completedItems,
    progress: itemCount ? Math.round((completedItems / itemCount) * 100) : 0,
    status:
      itemCount > 0 && completedItems >= itemCount
        ? "completed"
        : completedItems > 0
          ? "in-progress"
          : "not-started"
  };
}

/**
 * Lesson counts and completions for every enrolled course, in two queries
 * rather than two per course.
 *
 * Modules name their course by id or by course code (the same pair
 * modules.controller's courseMatch accepts), so both are resolved back to the
 * course document here. Completions are counted through that module → course
 * map instead of ModuleProgress.courseId, which keeps a lesson that has since
 * moved (or been deleted) from inflating a card's count.
 */
async function buildProgressIndex(studentId, student, courses) {
  const index = new Map();
  for (const course of courses) {
    index.set(String(course._id), { total: 0, completed: 0 });
  }
  // Every counted completion, oldest first, so a caller can date the moment a
  // threshold was crossed rather than guess at it.
  const completions = [];
  // moduleId -> the course it counts towards. Handed back so the quizzes can be
  // attributed through the same map, rather than a second copy of it.
  const owner = new Map();
  const empty = { index, completions, owner };

  if (!courses.length || !(await collectionExists(MODULES_COLLECTION))) return empty;

  const byId = new Map(courses.map((course) => [String(course._id), String(course._id)]));
  const byCode = new Map();
  for (const course of courses) {
    const code = courseCodeOf(course);
    if (code) byCode.set(code.toLowerCase(), String(course._id));
  }

  const codes = courses.map(courseCodeOf).filter(Boolean);
  const modules = await mongoose.connection
    .collection(MODULES_COLLECTION)
    .find(
      {
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
      },
      { projection: { _id: 1, courseId: 1, courseCode: 1 } }
    )
    .toArray();

  for (const module of modules) {
    const key =
      byId.get(String(module.courseId)) ??
      byCode.get(String(module.courseCode ?? "").trim().toLowerCase());
    if (!key) continue;

    owner.set(String(module._id), key);
    index.get(key).total += 1;
  }

  if (!(await collectionExists(PROGRESS_COLLECTION))) return empty;

  // Progress rows are written with the session's student id; accept the
  // student number form too, matching how the enrollment above is looked up.
  const studentKeys = [
    ...idCandidates(studentId),
    ...(student?._id ? idCandidates(student._id) : []),
    ...(student?.student_id ? idCandidates(student.student_id) : [])
  ];

  const entries = await mongoose.connection
    .collection(PROGRESS_COLLECTION)
    .find({ studentId: { $in: studentKeys } }, { projection: { moduleId: 1, completedAt: 1 } })
    .toArray();

  const counted = new Set();
  for (const entry of entries) {
    const moduleId = String(entry.moduleId);
    if (counted.has(moduleId)) continue;
    counted.add(moduleId);

    const key = owner.get(moduleId);
    if (!key) continue;

    index.get(key).completed += 1;
    completions.push({ moduleId, courseId: key, completedAt: entry.completedAt ?? null });
  }

  completions.sort((a, b) => new Date(a.completedAt ?? 0) - new Date(b.completedAt ?? 0));

  return { index, completions, owner };
}

/**
 * The lesson quizzes and the final this student has passed, per course.
 *
 * Passing is `passedResult` against the normalised paper and nothing else —
 * the same question the assessor's console, the badge wall and the student's
 * own rail all ask of a submission. A quiz that earned a badge is therefore a
 * quiz that counts here, which is the point: a student should not be able to
 * hold a badge for a lesson their progress bar says they have not finished.
 *
 * Superseded sittings decide nothing; the latest attempt is the one that
 * counts, the same rule everywhere else applies.
 *
 * Quizzes are attributed through the module → course map for the same reason
 * completions are — a quiz whose lesson has since been deleted counts towards
 * nothing. A final belongs to no lesson, so it is attributed by the course it
 * names. Quizzes are gathered as a set of module ids rather than counted,
 * because two attempts at one paper must not read as two quizzes passed.
 */
async function buildPassIndex(studentId, student, courses, owner) {
  const index = new Map();
  for (const course of courses) {
    index.set(String(course._id), { quizzes: new Set(), final: false });
  }

  if (!courses.length) return index;
  if (!(await collectionExists(RESULTS_COLLECTION))) return index;
  if (!(await collectionExists(ASSESSMENTS_COLLECTION))) return index;

  const studentKeys = [
    ...idCandidates(studentId),
    ...(student?._id ? idCandidates(student._id) : [])
  ];

  const results = await mongoose.connection
    .collection(RESULTS_COLLECTION)
    .find({ studentId: { $in: studentKeys }, superseded: { $ne: true } })
    .toArray();
  if (results.length === 0) return index;

  const assessments = await mongoose.connection
    .collection(ASSESSMENTS_COLLECTION)
    .find({ _id: { $in: results.flatMap((result) => idCandidates(result.assessmentId)) } })
    .toArray();

  const assessmentById = new Map(assessments.map((entry) => [String(entry._id), entry]));

  for (const result of results) {
    const assessment = assessmentById.get(String(result.assessmentId));
    if (!assessment) continue;

    // Normalised rather than read raw: a paper written while assessments still
    // held a bank carries the pass mark of the shorter paper drawn out of it,
    // and the rail marks the student against the normalised one.
    const summary = toAssessmentSummary(assessment);
    if (!summary || !passedResult(result, summary)) continue;

    if (summary.scope === "final") {
      const key = String(result.courseId ?? assessment.courseId ?? "");
      if (index.has(key)) index.get(key).final = true;
      continue;
    }

    const moduleId = String(result.moduleId ?? summary.moduleId ?? "");
    const key = owner.get(moduleId);
    if (key) index.get(key).quizzes.add(moduleId);
  }

  return index;
}

/**
 * The student and the courses they are enrolled in.
 *
 * Enrollment lives on the Student document: find the student (by Mongo _id
 * from the session, or by their student number), then load the Course docs
 * listed in enrolledCourses.
 */
async function loadEnrollment(studentId) {
  const student = await mongoose.connection
    .collection(STUDENTS_COLLECTION)
    .findOne({
      $or: [{ _id: { $in: idCandidates(studentId) } }, { student_id: studentId }]
    });

  const enrolled =
    student?.enrolledCourses ?? student?.enrolled_courses ?? student?.courses ?? [];

  if (!Array.isArray(enrolled) || enrolled.length === 0) return { student, courses: [] };

  const courses = await mongoose.connection
    .collection(COURSES_COLLECTION)
    .find({ _id: { $in: enrolled.flatMap(idCandidates) } })
    .toArray();

  return { student, courses };
}

export async function getStudentCourses(request, response) {
  const studentId = request.params.id;

  // Still waiting on the database / courses collection — respond with nothing
  // yet rather than failing.
  if (!(await collectionExists(COURSES_COLLECTION))) {
    return response.json({ courses: [], pending: true });
  }

  const { student, courses } = await loadEnrollment(studentId);
  if (courses.length === 0) return response.json({ courses: [] });

  const { index, owner } = await buildProgressIndex(studentId, student, courses);
  const passes = await buildPassIndex(studentId, student, courses, owner);
  // Classes hold the student by their Mongo _id; the route may have been given
  // their student number instead, so ask with the id the class would have used.
  const suspensions = await loadStudentSuspensions(student?._id ?? studentId);

  return response.json({
    courses: courses.map((course) => {
      const { total, completed } = index.get(String(course._id));
      const passed = passes.get(String(course._id)) ?? { quizzes: new Set(), final: false };
      return toPublicCourse(
        course,
        progressSummary(total, completed, passed.quizzes.size, passed.final),
        suspensions.get(String(course._id)) ?? null
      );
    })
  });
}

/**
 * The Student Dashboard's skill gap analysis.
 *
 * Computed from the final exams this student has sat rather than stored, so it
 * can never disagree with the grade the assessor console shows — an assessor
 * who overrules an item changes both at once. See skillgap.service.js for the
 * formulas and for why only the final counts.
 */
export async function getStudentSkillGap(request, response) {
  const studentId = request.params.id;

  if (!(await collectionExists(COURSES_COLLECTION))) {
    return response.json({ courses: [], pending: true });
  }

  const { courses } = await loadEnrollment(studentId);
  if (courses.length === 0) return response.json({ courses: [] });

  return response.json({ courses: await buildStudentSkillGap(studentId, courses) });
}

/* ────────────────── Certifications and badges ────────────────── */

/**
 * Two different kinds of recognition, kept apart on purpose.
 *
 * A certification is the formal thing: a micro-credential an assessor released
 * after approving a final grade (StudentResult.credential), so it names a
 * course and an assessment and carries an issue date.
 *
 * A badge is the lesson-level thing, and this endpoint does not build it —
 * badges/badges.service.js owns that. The admin console asks the same
 * question of the same catalog, and the two must never answer differently.
 */

const isoDate = (value) => (value ? new Date(value).toISOString() : null);

async function buildCertifications(studentId, student, courses) {
  if (!(await collectionExists(RESULTS_COLLECTION))) return [];

  const studentKeys = [
    ...idCandidates(studentId),
    ...(student?._id ? idCandidates(student._id) : [])
  ];

  const results = await mongoose.connection
    .collection(RESULTS_COLLECTION)
    .find({ studentId: { $in: studentKeys }, superseded: { $ne: true } })
    .toArray();

  // Certificates only, which is all a credential ever is: one per course, off
  // the final. "none" is every other result — a failed final, and every lesson
  // quiz whether passed or not, since those earn badges and are shown as
  // badges. A pending one is named here because the student has passed and is
  // waiting on the assessor to release it.
  const claimed = results.filter((result) =>
    ["pending", "issued"].includes(result.credential?.status)
  );
  if (claimed.length === 0) return [];

  const assessments = (await collectionExists(ASSESSMENTS_COLLECTION))
    ? await mongoose.connection
        .collection(ASSESSMENTS_COLLECTION)
        .find({
          _id: { $in: claimed.flatMap((result) => idCandidates(result.assessmentId)) }
        })
        .toArray()
    : [];

  const assessmentById = new Map(assessments.map((entry) => [String(entry._id), entry]));
  const courseById = new Map(courses.map((course) => [String(course._id), course]));

  return claimed
    .map((result) => {
      const assessment = assessmentById.get(String(result.assessmentId));
      const course = courseById.get(String(result.courseId));

      return {
        id: String(result._id),
        name:
          result.credential?.name ??
          (assessment?.title ? `${assessment.title} Credential` : "Course Credential"),
        courseCode: course ? courseCodeOf(course) : "",
        courseTitle: course
          ? (course.title ?? course.courseName ?? course.name ?? "")
          : "",
        assessmentTitle: assessment?.title ?? "",
        status: result.credential?.status,
        issuedAt: isoDate(result.credential?.issuedAt),
        score: Number(result.aiGrading?.score ?? 0),
        totalPoints: assessment?.totalPoints ?? null
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "issued" ? -1 : 1;
      return new Date(b.issuedAt ?? 0) - new Date(a.issuedAt ?? 0);
    });
}

export async function getStudentAchievements(request, response) {
  const studentId = request.params.id;

  if (!(await collectionExists(COURSES_COLLECTION))) {
    return response.json({ certifications: [], badges: [], pending: true });
  }

  const { student, courses } = await loadEnrollment(studentId);
  const certifications = await buildCertifications(studentId, student, courses);
  const badges = await buildStudentBadges(studentId, student, courses);

  // The stamped PDF for each release, matched to its credential so the card
  // can offer the download. A credential without one still lists — the record
  // stands whether or not the sheet was generated.
  const issued = await listIssuedCertificates(student?._id ?? studentId);
  const documentBySubmission = new Map(
    issued.map((certificate) => [String(certificate.submissionId), certificate])
  );

  return response.json({
    certifications: certifications.map((entry) => ({
      ...entry,
      document: documentBySubmission.get(String(entry.id)) ?? null
    })),
    badges
  });
}
