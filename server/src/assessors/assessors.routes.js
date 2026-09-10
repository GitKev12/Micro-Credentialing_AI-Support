import { Router } from "express";
import {
  getClasses,
  getOverview,
  getPendingCredentials,
  getRoster,
  getStudentDetail,
  issueCredential,
  setRosterStudentSuspension
} from "./assessors.controller.js";
import {
  generateCourseAssessment,
  getAssessmentResults,
  getCourseAssessment,
  getCourseAssessments,
  getStudentPaper,
  postCourseAssessment,
  unpostCourseAssessment,
  updateCourseAssessment
} from "./assessments.controller.js";
import { getCourseTos, saveCourseTos } from "./tos.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireOwnAssessor } from "./assessors.guard.js";

// Mounted at /api/assessors. :assessorId accepts the Mongo id or the ASS###
// number, so the client can pass whichever the auth session carries.
//
//   GET  /:assessorId/overview                              — profile + release counts
//   GET  /:assessorId/classes                               — assigned courses
//   GET  /:assessorId/classes/:courseId/roster              — enrolled students
//   GET  /:assessorId/classes/:courseId/students/:studentId — per-student detail
//   PATCH /:assessorId/classes/:courseId/students/:studentId/suspension
//                                                           — lock/unlock { suspended }
//
//   Generating and releasing a course's papers — see assessments.controller.js:
//   GET  /:assessorId/classes/:courseId/assessments               — lesson + final state
//   GET  /:assessorId/classes/:courseId/assessments/:id           — one paper, keys included
//   POST /:assessorId/classes/:courseId/assessments/generate      — write a draft
//   PUT  /:assessorId/classes/:courseId/assessments/:id           — correct questions
//   POST /:assessorId/classes/:courseId/assessments/:id/post      — release to the course
//   POST /:assessorId/classes/:courseId/assessments/:id/unpost    — take it back off
//
//   The Table of Specification — the blueprint generation follows:
//   GET  /:assessorId/classes/:courseId/tos                       — blueprint + lessons
//   PUT  /:assessorId/classes/:courseId/tos                       — save it
//
//   The Results screen — one posted paper, student by student:
//   GET  /:assessorId/classes/:courseId/assessments/:id/results
//   GET  /:assessorId/classes/:courseId/assessments/:id/results/:studentId
//                                                           — their marked paper
//
//   GET  /:assessorId/credentials                           — passes awaiting issue
//   POST /:assessorId/credentials/:submissionId/issue       — issue the micro-credential
const router = Router();

// Writing papers and issuing credentials are staff work, and each assessor's
// work is their own. The role guard says you are staff; `requireOwnAssessor`
// says the :assessorId in the path is yours — resolving it to a document first,
// so the Mongo id and the ASS### number both answer the same question. It
// leaves the assessor on `request.assessor`, which is why no handler below
// looks one up.
router.use(requireAuth, requireRole("assessor", "admin"));

// Mounted on the path rather than added to the line above, because a
// `router.use` with no path of its own never has the route's parameters
// filled in — `request.params.assessorId` would be undefined and every call,
// including an assessor's own, would be refused.
router.use("/:assessorId", requireOwnAssessor);

router.get("/:assessorId/overview", getOverview);

router.get("/:assessorId/classes", getClasses);
router.get("/:assessorId/classes/:courseId/roster", getRoster);

// The blueprint is not a paper, so it is not guarded as one: writing it puts
// nothing in front of a class, and an assessor may well want the specification
// on record for a course whose run has ended.
router.get("/:assessorId/classes/:courseId/tos", getCourseTos);
router.put("/:assessorId/classes/:courseId/tos", saveCourseTos);
router.get("/:assessorId/classes/:courseId/students/:studentId", getStudentDetail);

// The one write here that changes what a student can *do* rather than what
// their record says, and the only one an assessor makes about a person rather
// than a paper. It is the admin console's own suspension — same field, same
// function — reached through a route that will only touch a student on this
// assessor's own course.
router.patch(
  "/:assessorId/classes/:courseId/students/:studentId/suspension",
  setRosterStudentSuspension
);

// Generating is the only thing here that spends money, and it is a deliberate
// press by a member of staff who is watching the screen — the same shape the
// student's "Take the Quiz" had, moved to the person who reads the result.
router.get("/:assessorId/classes/:courseId/assessments", getCourseAssessments);
router.post("/:assessorId/classes/:courseId/assessments/generate", generateCourseAssessment);
router.get("/:assessorId/classes/:courseId/assessments/:assessmentId", getCourseAssessment);
router.put("/:assessorId/classes/:courseId/assessments/:assessmentId", updateCourseAssessment);
router.post("/:assessorId/classes/:courseId/assessments/:assessmentId/post", postCourseAssessment);
router.post("/:assessorId/classes/:courseId/assessments/:assessmentId/unpost", unpostCourseAssessment);

router.get(
  "/:assessorId/classes/:courseId/assessments/:assessmentId/results",
  getAssessmentResults
);

// One student's handed-in paper, with the key beside what they put down. Reads
// only: the mark was made at hand-in and there is nothing here to change it.
router.get(
  "/:assessorId/classes/:courseId/assessments/:assessmentId/results/:studentId",
  getStudentPaper
);

// A paper is marked against its key when it is handed in, and that mark is
// final — there is nothing here to reopen a submission with. A pass writes its
// own pending credential; these two are what an assessor does about it.
router.get("/:assessorId/credentials", getPendingCredentials);
router.post("/:assessorId/credentials/:submissionId/issue", issueCredential);

export default router;
