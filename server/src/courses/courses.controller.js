import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { listIssuedCertificates } from "../certificates/certificates.service.js";

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
 * Expected course performance document shape (one per student per course),
 * powering the Student Dashboard's skill gap analysis:
 *   {
 *     studentId,
 *     courseId,
 *     title,
 *     icon,        // optional emoji shown on the card
 *     imageUrl,    // optional card backdrop
 *     status,      // "in-progress" | "completed"
 *     performance, // overall score, 0–100
 *     skills: [{ topic, score }]
 *   }
 */
const STUDENTS_COLLECTION = "Student";
const COURSES_COLLECTION = "Course";
const PERFORMANCE_COLLECTION = "CoursePerformance";
const MODULES_COLLECTION = "LearningModule";
const PROGRESS_COLLECTION = "ModuleProgress";
const RESULTS_COLLECTION = "StudentResult";
const ASSESSMENTS_COLLECTION = "Assessment";

function courseCodeOf(course) {
  return String(course.code ?? course.courseCode ?? course.course_code ?? "").trim();
}

function toPublicCourse(course, progress) {
  return {
    id: course._id,
    code: courseCodeOf(course),
    title: course.title ?? course.courseName ?? course.name ?? course.course_name ?? "",
    description: course.description ?? "",
    imageUrl: course.imageUrl ?? course.image_url ?? null,
    // Set when a picture is stored in the CourseImage bucket — the client
    // then loads GET /api/courses/:id/image.
    hasImage: Boolean(course.imageFileId),
    ...progress
  };
}

/**
 * Where the student stands in one course.
 *
 * Status is derived rather than stored, so the "My Courses" card can never
 * drift from the checkmarks the reader writes: a course is completed once
 * every lesson has a ModuleProgress row, in progress from the first one, and
 * not started before that. A course with no lessons published yet reports
 * moduleCount 0 — the client says so rather than showing a 0% bar.
 */
function progressSummary(moduleCount, completedModules) {
  const completed = Math.max(0, Math.min(completedModules, moduleCount));

  return {
    moduleCount,
    completedModules: completed,
    progress: moduleCount ? Math.round((completed / moduleCount) * 100) : 0,
    status:
      moduleCount > 0 && completed >= moduleCount
        ? "completed"
        : completed > 0
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
  const empty = { index, completions };

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

  // moduleId → the course it counts towards.
  const owner = new Map();
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

  return { index, completions };
}

function clampScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeStatus(status) {
  const value = String(status ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return value === "completed" ? "completed" : "in-progress";
}

function toSkillEntry(skill) {
  return {
    topic: skill?.topic ?? skill?.name ?? skill?.skill ?? "",
    score: clampScore(skill?.score ?? skill?.value ?? skill?.percentage)
  };
}

function toPublicPerformance(entry) {
  const skills = Array.isArray(entry.skills) ? entry.skills : [];

  return {
    id: entry.courseId ?? entry.course_id ?? entry._id,
    title: entry.title ?? entry.name ?? entry.course_name ?? "",
    icon: entry.icon ?? null,
    imageUrl: entry.imageUrl ?? entry.image_url ?? null,
    status: normalizeStatus(entry.status),
    performance: clampScore(entry.performance ?? entry.overallScore ?? entry.overall_score),
    skills: skills.map(toSkillEntry).filter((skill) => skill.topic)
  };
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

  const { index } = await buildProgressIndex(studentId, student, courses);

  return response.json({
    courses: courses.map((course) => {
      const { total, completed } = index.get(String(course._id));
      return toPublicCourse(course, progressSummary(total, completed));
    })
  });
}

export async function getStudentSkillGap(request, response) {
  const studentId = request.params.id;

  // Same lookout behavior: no CoursePerformance collection yet means the
  // dashboard gets an empty (pending) result instead of an error.
  if (!(await collectionExists(PERFORMANCE_COLLECTION))) {
    return response.json({ courses: [], pending: true });
  }

  const entries = await mongoose.connection
    .collection(PERFORMANCE_COLLECTION)
    .find({ $or: [{ studentId }, { student_id: studentId }] })
    .toArray();

  return response.json({ courses: entries.map(toPublicPerformance) });
}

/* ────────────────── Certifications and badges ────────────────── */

/**
 * Two different kinds of recognition, kept apart on purpose.
 *
 * A certification is the formal thing: a micro-credential an assessor
 * released after approving a final grade (StudentResult.credential), so it
 * names a course and an assessment and carries an issue date. Nothing the
 * student does alone can produce one.
 *
 * A badge is the informal thing: a milestone this endpoint derives from work
 * already recorded — lessons read, courses finished. Nobody awards it and it
 * appears the moment the underlying rows say so, which is what lets the
 * section show something real while the assessment pipeline is still empty.
 *
 * Locked badges ship alongside earned ones with their current/target counts:
 * the section is meant to show what is reachable, not only what is held.
 */
const BADGE_CATALOGUE = [
  {
    id: "first-steps",
    name: "First Steps",
    icon: "🌱",
    description: "Finish your first lesson."
  },
  {
    id: "halfway",
    name: "Halfway There",
    // No variation selector in any glyph here — VS16 renders inconsistently
    // across the platforms this runs on.
    icon: "🚩",
    description: "Reach the midpoint of a course."
  },
  {
    id: "scholar",
    name: "Scholar",
    icon: "📚",
    description: "Finish 10 lessons."
  },
  {
    id: "finisher",
    name: "Course Finisher",
    icon: "🎓",
    description: "Finish every lesson in a course."
  },
  {
    id: "certified",
    name: "Certified",
    icon: "🏅",
    description: "Earn your first micro-credential."
  }
];

const isoDate = (value) => (value ? new Date(value).toISOString() : null);

/** The date a count-based badge was actually reached: its Nth completion. */
function nthCompletionDate(completions, n) {
  return completions.length >= n ? isoDate(completions[n - 1].completedAt) : null;
}

function buildBadges({ completions, index, certifications }) {
  const perCourse = new Map();
  for (const completion of completions) {
    if (!perCourse.has(completion.courseId)) perCourse.set(completion.courseId, []);
    perCourse.get(completion.courseId).push(completion);
  }

  // The earliest date any one course crossed a share of its lessons. Both
  // milestones are dated from the completion that crossed the line rather
  // than from the newest row, so a badge never post-dates its own reason.
  const crossedAt = (share) => {
    const dates = [];
    for (const [courseId, rows] of perCourse) {
      const total = index.get(courseId)?.total ?? 0;
      if (!total) continue;

      const needed = Math.ceil(total * share);
      if (rows.length >= needed && needed > 0) dates.push(rows[needed - 1].completedAt);
    }
    return dates.length
      ? isoDate(dates.map((date) => new Date(date ?? 0)).sort((a, b) => a - b)[0])
      : null;
  };

  const coursesAt = (share) =>
    [...perCourse.entries()].filter(([courseId, rows]) => {
      const total = index.get(courseId)?.total ?? 0;
      return total > 0 && rows.length >= Math.ceil(total * share);
    }).length;

  const issued = certifications.filter((entry) => entry.status === "issued");
  const measures = {
    "first-steps": { current: Math.min(completions.length, 1), target: 1, at: nthCompletionDate(completions, 1) },
    halfway: { current: Math.min(coursesAt(0.5), 1), target: 1, at: crossedAt(0.5) },
    scholar: { current: Math.min(completions.length, 10), target: 10, at: nthCompletionDate(completions, 10) },
    finisher: { current: Math.min(coursesAt(1), 1), target: 1, at: crossedAt(1) },
    certified: { current: Math.min(issued.length, 1), target: 1, at: issued[0]?.issuedAt ?? null }
  };

  return BADGE_CATALOGUE.map((badge) => {
    const { current, target, at } = measures[badge.id];
    const earned = current >= target;

    return {
      ...badge,
      earned,
      earnedAt: earned ? at : null,
      current,
      target
    };
  }).sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    if (a.earned) return new Date(b.earnedAt ?? 0) - new Date(a.earnedAt ?? 0);
    // Locked ones lead with whatever is closest to falling.
    return b.current / b.target - a.current / a.target;
  });
}

async function buildCertifications(studentId, student, courses) {
  if (!(await collectionExists(RESULTS_COLLECTION))) return [];

  const studentKeys = [
    ...idCandidates(studentId),
    ...(student?._id ? idCandidates(student._id) : [])
  ];

  const results = await mongoose.connection
    .collection(RESULTS_COLLECTION)
    .find({ studentId: { $in: studentKeys } })
    .toArray();

  // Only released credentials are the student's business: "none" means the
  // assessor has not approved the grade, and showing it would promise a
  // certificate that may never be issued.
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
        score: result.review?.status === "released" ? (result.review?.finalScore ?? null) : null,
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
  const { index, completions } = await buildProgressIndex(studentId, student, courses);
  const certifications = await buildCertifications(studentId, student, courses);

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
    badges: buildBadges({ completions, index, certifications })
  });
}
