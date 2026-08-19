import mongoose from "mongoose";
import { idCandidates } from "../lib/mongo.js";
import { DEFAULT_POINTS_PER_ITEM, defaultPassMark } from "../assessments/assessments.format.js";
import { issueCertificate } from "../certificates/certificates.service.js";
import { aiStatusOf, isReleased, openFlags } from "./grading.js";

/**
 * Assessor console endpoints — classes, roster, grading queue, submission
 * review and credential release.
 *
 * These read the live MainSystemDB collections. Grading data lives in two
 * collections that the AI assessment pipeline will populate:
 *
 * Assessment — one generated quiz per module:
 *   { moduleId, courseId, title, credentialName?, pointsPerItem, totalPoints,
 *     passMark, source, items: [{ id, n, q, choices, key }] }
 *
 * StudentResult — one submission per student per assessment:
 *   { assessmentId, moduleId, courseId, studentId, submittedAt,
 *     answers: [{ itemId, choice }],
 *     aiGrading: { status: "graded"|"unavailable", reason?, score,
 *                  items: [{ itemId, verdict: "correct"|"incorrect"|"flagged",
 *                            aiGuess?, why? }] },
 *     review: { status: "pending"|"draft"|"released", overrides: { itemId: verdict },
 *               finalScore, remark, gradedBy, gradedAt },
 *     credential: { status: "none"|"pending"|"issued", name, issuedAt, issuedBy } }
 *
 * Both collections exist but are empty until assessments are generated, so
 * every list endpoint degrades to empty rows rather than failing. Everything
 * shown is derived from real documents:
 *
 *   class.pending    <- StudentResults awaiting release in that course
 *   roster.done      <- ModuleProgress completions for that course
 *   roster.creds     <- issued credentials on StudentResults
 *   summary.toGrade  <- unreleased StudentResults across assigned courses
 */
const ASSESSORS_COLLECTION = "Assessor";
const ASSESSMENTS_COLLECTION = "Assessment";
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

/** Modules are titled "Chapter 3", "week 10 11", … — sort by the last number. */
function lessonNumber(title) {
  const numbers = String(title ?? "").match(/\d+/g);
  return numbers ? Number(numbers[numbers.length - 1]) : Number.POSITIVE_INFINITY;
}

/** Assessors sign in with either their Mongo id or their ASS### number. */
async function findAssessor(idOrNumber) {
  return collection(ASSESSORS_COLLECTION).findOne({
    $or: [{ _id: { $in: idCandidates(idOrNumber) } }, { assessor_id: String(idOrNumber) }]
  });
}

async function coursesForAssessor(assessor) {
  const assigned = assessor.assigned_courses ?? [];
  if (assigned.length === 0) return [];
  return collection(COURSES_COLLECTION)
    .find({ _id: { $in: manyCandidates(assigned) } })
    .toArray();
}

function moduleFilterForCourse(course) {
  return {
    $or: [{ courseId: { $in: idCandidates(course._id) } }, { courseCode: courseCode(course) }]
  };
}

async function resultsForCourses(courses) {
  if (courses.length === 0) return [];
  return collection(RESULTS_COLLECTION)
    .find({ courseId: { $in: manyCandidates(courses.map((course) => course._id)) } })
    .toArray();
}

/**
 * What a paper is worth. `itemCount` is the caller's best guess at its length,
 * used only when the assessment does not say — and a bank-backed assessment
 * always says, because counting the bank instead of the paper drawn from it
 * would inflate every total on these screens several times over.
 */
function reviewConfig(assessment, itemCount) {
  const pointsPerItem = assessment?.pointsPerItem ?? DEFAULT_POINTS_PER_ITEM;
  const perAttempt = Number(assessment?.itemsPerAttempt) > 0
    ? Number(assessment.itemsPerAttempt)
    : itemCount;
  const total = assessment?.totalPoints ?? pointsPerItem * perAttempt;
  const passMark = assessment?.passMark ?? defaultPassMark(total);
  return { pointsPerItem, total, passMark };
}

function credentialName(assessment) {
  if (assessment?.credentialName) return assessment.credentialName;
  return assessment?.title ? `${assessment.title} Credential` : "Course Credential";
}

/**
 * The questions this submission actually contained.
 *
 * An Assessment may hold a bank several times longer than the paper drawn from
 * it, so `assessment.items` is the wrong thing to count or to display. The
 * submission records what was served; the two older shapes are the fallbacks
 * for results written before it did.
 */
function servedItemIds(result, assessment) {
  if (result?.servedItemIds?.length) return result.servedItemIds.map(asId);
  if (assessment?.items?.length) {
    return assessment.items.map((item, index) => asId(item.id ?? index + 1));
  }
  return (result?.answers ?? []).map((answer) => asId(answer.itemId));
}

/** The AI's verdict for an item — a flagged item falls back to its best guess. */
function aiVerdict(item) {
  return item?.verdict === "flagged" ? (item.aiGuess ?? null) : (item?.verdict ?? null);
}

/** Score implied by the AI verdicts plus the assessor's overrides. */
function computedScore(result, assessment) {
  const overrides = result.review?.overrides ?? {};
  const aiByItem = new Map(
    (result.aiGrading?.items ?? []).map((item) => [asId(item.itemId), item])
  );
  const itemIds = servedItemIds(result, assessment);
  const { pointsPerItem } = reviewConfig(assessment, itemIds.length);

  return itemIds.reduce((sum, itemId) => {
    const verdict = overrides[itemId] ?? aiVerdict(aiByItem.get(itemId));
    return sum + (verdict === "correct" ? pointsPerItem : 0);
  }, 0);
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

  const assessor = await findAssessor(request.params.assessorId);
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  const courses = await coursesForAssessor(assessor);
  const results = await resultsForCourses(courses);

  const pending = results.filter((result) => !isReleased(result));

  return response.json({
    assessor: {
      id: asId(assessor._id),
      idNumber: assessor.assessor_id ?? "",
      name: assessor.full_name ?? assessor.name ?? assessor.email ?? "Unnamed assessor",
      email: assessor.email ?? null
    },
    summary: {
      toGrade: pending.length,
      aiFlagged: pending.filter(
        (result) => aiStatusOf(result) === "graded" && openFlags(result) > 0
      ).length,
      credentials: results.filter(
        (result) => isReleased(result) && result.credential?.status === "pending"
      ).length
    }
  });
}

/* ─────────────────────────── Classes ─────────────────────────── */

export async function getClasses(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await findAssessor(request.params.assessorId);
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  const courses = await coursesForAssessor(assessor);
  const results = await resultsForCourses(courses);

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

  const pendingCounts = new Map();
  results
    .filter((result) => !isReleased(result))
    .forEach((result) => {
      const key = asId(result.courseId);
      pendingCounts.set(key, (pendingCounts.get(key) ?? 0) + 1);
    });

  return response.json({
    classes: courses.map((course) => ({
      id: asId(course._id),
      code: courseCode(course),
      name: courseTitle(course),
      // Sections are not stored on the Course document yet.
      section: course.section ?? null,
      students: studentCounts.get(asId(course._id)) ?? 0,
      pending: pendingCounts.get(asId(course._id)) ?? 0
    }))
  });
}

/** The course from the route, but only if it is assigned to this assessor. */
async function findAssignedCourse(assessor, courseId) {
  const courses = await coursesForAssessor(assessor);
  return courses.find((course) => idCandidates(courseId).some((id) => asId(id) === asId(course._id))) ?? null;
}

/* ─────────────────────────── Roster ─────────────────────────── */

export async function getRoster(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await findAssessor(request.params.assessorId);
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  const course = await findAssignedCourse(assessor, request.params.courseId);
  if (!course) return response.status(404).json({ message: "Course not found for this assessor." });

  const [students, totalModules, results, progress] = await Promise.all([
    collection(STUDENTS_COLLECTION)
      .find({ enrolledCourses: { $in: idCandidates(course._id) } })
      .sort({ last_name: 1 })
      .toArray(),
    collection(MODULES_COLLECTION).countDocuments(moduleFilterForCourse(course)),
    resultsForCourses([course]),
    collection(PROGRESS_COLLECTION)
      .find({ courseId: { $in: idCandidates(course._id) } })
      .toArray()
  ]);

  const doneByStudent = new Map();
  progress.forEach((entry) => {
    const key = asId(entry.studentId);
    doneByStudent.set(key, (doneByStudent.get(key) ?? 0) + 1);
  });

  const pendingByStudent = new Map();
  const credsByStudent = new Map();
  results.forEach((result) => {
    const key = asId(result.studentId);
    if (!isReleased(result)) {
      pendingByStudent.set(key, (pendingByStudent.get(key) ?? 0) + 1);
    }
    if (result.credential?.status === "issued") {
      credsByStudent.set(key, (credsByStudent.get(key) ?? 0) + 1);
    }
  });

  return response.json({
    course: {
      id: asId(course._id),
      code: courseCode(course),
      name: courseTitle(course),
      section: course.section ?? null
    },
    totalModules,
    roster: students.map((student) => ({
      id: asId(student._id),
      name: studentName(student),
      sid: student.student_id ?? null,
      done: doneByStudent.get(asId(student._id)) ?? 0,
      creds: credsByStudent.get(asId(student._id)) ?? 0,
      pending: pendingByStudent.get(asId(student._id)) ?? 0
    }))
  });
}

/* ─────────────────────────── Queue ─────────────────────────── */

function queueRow(result, student, assessment, course) {
  const graded = aiStatusOf(result) === "graded";
  const config = reviewConfig(assessment, (assessment?.items ?? result.answers ?? []).length);

  return {
    id: asId(result._id),
    studentId: asId(result.studentId),
    name: studentName(student),
    sid: student?.student_id ?? null,
    assessment: assessment?.title ?? "Assessment",
    // Which kind of paper this is. A final carries the course credential and a
    // lesson quiz carries a badge, so they are not interchangeable work — the
    // queue groups and orders by this, and could not tell them apart without
    // it. Derived the same way toAssessmentSummary derives it: an assessment
    // belonging to no single lesson is a final.
    scope: assessment?.scope === "final" || !assessment?.moduleId ? "final" : "lesson",
    course: courseCode(course),
    submittedAt: result.submittedAt ?? null,
    aiStatus: aiStatusOf(result),
    ai: graded ? (result.aiGrading?.score ?? null) : null,
    flags: graded ? openFlags(result) : null,
    total: config.total,
    // What the mark has to clear. The queue showed a score with nothing to read
    // it against, so whether a submission passed — the thing that decides
    // whether releasing it issues a credential — was only visible one click in.
    passMark: config.passMark,
    pointsPerItem: config.pointsPerItem,
    reviewStatus: result.review?.status ?? "pending"
  };
}

export async function getQueue(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await findAssessor(request.params.assessorId);
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  const courses = await coursesForAssessor(assessor);
  const courseById = new Map(courses.map((course) => [asId(course._id), course]));

  const results = (await resultsForCourses(courses)).filter((result) => !isReleased(result));
  results.sort((a, b) => new Date(a.submittedAt ?? 0) - new Date(b.submittedAt ?? 0));

  const [students, assessments] = await Promise.all([studentMap(), assessmentMap(results)]);

  const queue = results.map((result) =>
    queueRow(
      result,
      students.get(asId(result.studentId)),
      assessments.get(asId(result.assessmentId)),
      courseById.get(asId(result.courseId))
    )
  );

  return response.json({
    queue,
    counts: {
      all: queue.length,
      flagged: queue.filter((row) => row.flags > 0).length,
      confident: queue.filter((row) => row.aiStatus === "graded" && row.flags === 0).length,
      manual: queue.filter((row) => row.aiStatus === "unavailable").length
    }
  });
}

/* ─────────────────────────── Review ─────────────────────────── */

/** A StudentResult from the route, but only inside this assessor's courses. */
async function findAssignedResult(assessor, submissionId) {
  const result = await collection(RESULTS_COLLECTION).findOne({
    _id: { $in: idCandidates(submissionId) }
  });
  if (!result) return { result: null, course: null };

  const course = await findAssignedCourse(assessor, result.courseId);
  return { result: course ? result : null, course };
}

async function reviewPayload(result, course) {
  const [assessment, student] = await Promise.all([
    collection(ASSESSMENTS_COLLECTION).findOne({
      _id: { $in: idCandidates(result.assessmentId) }
    }),
    collection(STUDENTS_COLLECTION).findOne({ _id: { $in: idCandidates(result.studentId) } })
  ]);

  const answerByItem = new Map(
    (result.answers ?? []).map((answer) => [asId(answer.itemId), answer.choice])
  );
  const aiByItem = new Map(
    (result.aiGrading?.items ?? []).map((item) => [asId(item.itemId), item])
  );

  // Only the questions this student was given. Reviewing the whole bank would
  // show the assessor twenty-four questions against eight answers, and mark
  // the sixteen nobody was asked as wrong.
  const served = new Set(servedItemIds(result, assessment));
  const sourceItems = (
    assessment?.items ??
    (result.answers ?? []).map((answer, index) => ({ id: answer.itemId, n: index + 1 }))
  ).filter((item, index) => served.has(asId(item.id ?? index + 1)));

  const items = sourceItems.map((item, index) => {
    const id = asId(item.id ?? index + 1);
    const ai = aiByItem.get(id);
    return {
      id,
      n: item.n ?? index + 1,
      q: item.q ?? item.question ?? "",
      choice: answerByItem.get(id) ?? null,
      key: item.key ?? null,
      verdict: ai?.verdict ?? null,
      aiGuess: ai?.aiGuess ?? null,
      why: ai?.why ?? null
    };
  });

  const config = reviewConfig(assessment, items.length);
  const title = assessment?.title ?? "Assessment";

  return {
    submission: {
      id: asId(result._id),
      studentId: asId(result.studentId),
      studentName: studentName(student),
      sid: student?.student_id ?? null,
      submittedAt: result.submittedAt ?? null
    },
    assessment: {
      id: assessment ? asId(assessment._id) : null,
      title,
      meta: `${courseCode(course)} · ${title} · ${config.total} points`,
      source: assessment?.source ?? null,
      credentialName: credentialName(assessment)
    },
    reviewConfig: config,
    aiStatus: aiStatusOf(result),
    aiStatusReason: result.aiGrading?.reason ?? null,
    aiScore: aiStatusOf(result) === "graded" ? (result.aiGrading?.score ?? null) : null,
    items,
    review: {
      status: result.review?.status ?? "pending",
      overrides: result.review?.overrides ?? {},
      finalScore: result.review?.finalScore ?? null,
      remark: result.review?.remark ?? null,
      gradedAt: result.review?.gradedAt ?? null
    },
    credential: {
      status: result.credential?.status ?? "none",
      name: result.credential?.name ?? null,
      issuedAt: result.credential?.issuedAt ?? null
    }
  };
}

export async function getSubmission(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await findAssessor(request.params.assessorId);
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  const { result, course } = await findAssignedResult(assessor, request.params.submissionId);
  if (!result) return response.status(404).json({ message: "Submission not found." });

  return response.json(await reviewPayload(result, course));
}

const VERDICTS = new Set(["correct", "incorrect"]);

export async function saveReview(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await findAssessor(request.params.assessorId);
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  const { result, course } = await findAssignedResult(assessor, request.params.submissionId);
  if (!result) return response.status(404).json({ message: "Submission not found." });

  const { action, overrides, finalScore, remark } = request.body ?? {};
  if (action !== "draft" && action !== "release") {
    return response.status(400).json({ message: 'action must be "draft" or "release".' });
  }

  // Keep only well-formed overrides: { itemId: "correct" | "incorrect" }.
  const cleanOverrides = {};
  Object.entries(overrides ?? {}).forEach(([itemId, verdict]) => {
    if (VERDICTS.has(verdict)) cleanOverrides[asId(itemId)] = verdict;
  });

  const assessment = await collection(ASSESSMENTS_COLLECTION).findOne({
    _id: { $in: idCandidates(result.assessmentId) }
  });
  const config = reviewConfig(assessment, (assessment?.items ?? result.answers ?? []).length);

  const draft = { ...result, review: { ...result.review, overrides: cleanOverrides } };
  const typed = Number.parseInt(finalScore, 10);
  const score = Number.isFinite(typed)
    ? Math.min(Math.max(typed, 0), config.total)
    : computedScore(draft, assessment);

  const review = {
    status: action === "release" ? "released" : "draft",
    overrides: cleanOverrides,
    finalScore: score,
    remark: String(remark ?? "").trim() || null,
    gradedBy: asId(assessor._id),
    gradedAt: new Date()
  };

  const update = { review };
  if (action === "release") {
    update.credential =
      score >= config.passMark
        ? { status: "pending", name: credentialName(assessment) }
        : { status: "none", name: null };
  }

  await collection(RESULTS_COLLECTION).updateOne({ _id: result._id }, { $set: update });

  return response.json(await reviewPayload({ ...result, ...update }, course));
}

/** Release every graded, flag-free pending submission at its AI score. */
export async function releaseConfident(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await findAssessor(request.params.assessorId);
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  const courses = await coursesForAssessor(assessor);
  const results = (await resultsForCourses(courses)).filter(
    (result) =>
      !isReleased(result) && aiStatusOf(result) === "graded" && openFlags(result) === 0
  );

  const assessments = await assessmentMap(results);

  let released = 0;
  for (const result of results) {
    const assessment = assessments.get(asId(result.assessmentId));
    const config = reviewConfig(assessment, (assessment?.items ?? result.answers ?? []).length);
    const score = result.aiGrading?.score ?? computedScore(result, assessment);

    await collection(RESULTS_COLLECTION).updateOne(
      { _id: result._id },
      {
        $set: {
          review: {
            status: "released",
            overrides: result.review?.overrides ?? {},
            finalScore: score,
            remark: result.review?.remark ?? null,
            gradedBy: asId(assessor._id),
            gradedAt: new Date()
          },
          credential:
            score >= config.passMark
              ? { status: "pending", name: credentialName(assessment) }
              : { status: "none", name: null }
        }
      }
    );
    released += 1;
  }

  return response.json({ released });
}

/* ─────────────────────────── Credentials ─────────────────────────── */

export async function getPendingCredentials(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await findAssessor(request.params.assessorId);
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  const courses = await coursesForAssessor(assessor);
  const courseById = new Map(courses.map((course) => [asId(course._id), course]));

  const results = (await resultsForCourses(courses)).filter(
    (result) => isReleased(result) && result.credential?.status === "pending"
  );

  const [students, assessments] = await Promise.all([studentMap(), assessmentMap(results)]);

  return response.json({
    pendingCredentials: results.map((result) => {
      const student = students.get(asId(result.studentId));
      const assessment = assessments.get(asId(result.assessmentId));
      const course = courseById.get(asId(result.courseId));
      const config = reviewConfig(assessment, (assessment?.items ?? []).length);
      const overrideCount = Object.keys(result.review?.overrides ?? {}).length;

      return {
        id: asId(result._id),
        studentId: asId(result.studentId),
        name: studentName(student),
        sid: student?.student_id ?? null,
        credential: result.credential?.name ?? credentialName(assessment),
        courseCode: courseCode(course),
        assessmentTitle: assessment?.title ?? "Assessment",
        finalScore: result.review?.finalScore ?? null,
        totalPoints: config.total,
        source:
          overrideCount > 0
            ? `You overrode ${overrideCount} item${overrideCount === 1 ? "" : "s"}`
            : "AI score accepted"
      };
    })
  });
}

export async function issueCredential(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await findAssessor(request.params.assessorId);
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  const { result } = await findAssignedResult(assessor, request.params.submissionId);
  if (!result) return response.status(404).json({ message: "Submission not found." });

  if (!isReleased(result) || result.credential?.status !== "pending") {
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
        credentialName((await assessmentMap([result])).get(asId(result.assessmentId)))
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

  const assessor = await findAssessor(request.params.assessorId);
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

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

  modules.sort((a, b) => {
    const difference = lessonNumber(a.title) - lessonNumber(b.title);
    if (difference !== 0) return difference;
    return String(a.title ?? "").localeCompare(String(b.title ?? ""), "en", { numeric: true });
  });

  const assessments = await assessmentMap(results);
  const resultByModule = new Map(results.map((result) => [asId(result.moduleId), result]));
  const readModules = new Set(progress.map((entry) => asId(entry.moduleId)));

  const moduleRows = modules.map((module, index) => {
    const result = resultByModule.get(asId(module._id));
    const assessment = result ? assessments.get(asId(result.assessmentId)) : null;
    const config = reviewConfig(assessment, (assessment?.items ?? []).length);

    const state = result ? (isReleased(result) ? "done" : "pending") : "locked";

    return {
      n: index + 1,
      moduleId: asId(module._id),
      title: module.title ?? module.fileName ?? "Untitled module",
      state,
      read: readModules.has(asId(module._id)),
      score: result && isReleased(result) ? (result.review?.finalScore ?? null) : null,
      total: result ? config.total : null,
      submissionId: result ? asId(result._id) : null,
      submittedAt: result?.submittedAt ?? null
    };
  });

  const releasedResults = results.filter(isReleased);
  const credentials = results
    .filter((result) => ["pending", "issued"].includes(result.credential?.status))
    .map((result) => ({
      name: result.credential?.name ?? credentialName(assessments.get(asId(result.assessmentId))),
      status: result.credential?.status,
      issuedAt: result.credential?.issuedAt ?? null,
      submissionId: asId(result._id)
    }));

  // The oldest ungraded submission, so the UI can point the assessor at it.
  const waitingResult = results
    .filter((result) => !isReleased(result))
    .sort((a, b) => new Date(a.submittedAt ?? 0) - new Date(b.submittedAt ?? 0))[0];
  const waitingAssessment = waitingResult
    ? assessments.get(asId(waitingResult.assessmentId))
    : null;

  return response.json({
    student: {
      id: asId(student._id),
      name: studentName(student),
      sid: student.student_id ?? null,
      email: student.email ?? null
    },
    course: {
      id: asId(course._id),
      code: courseCode(course),
      name: courseTitle(course),
      section: course.section ?? null
    },
    totalModules: modules.length,
    points: releasedResults.reduce((sum, result) => sum + (result.review?.finalScore ?? 0), 0),
    modules: moduleRows,
    credentials,
    waiting: waitingResult
      ? {
          submissionId: asId(waitingResult._id),
          assessmentTitle: waitingAssessment?.title ?? "Assessment",
          credentialName: credentialName(waitingAssessment),
          aiScore:
            aiStatusOf(waitingResult) === "graded"
              ? (waitingResult.aiGrading?.score ?? null)
              : null,
          total: reviewConfig(waitingAssessment, (waitingAssessment?.items ?? []).length).total
        }
      : null
  });
}
