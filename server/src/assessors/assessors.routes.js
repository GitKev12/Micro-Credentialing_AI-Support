import { Router } from "express";
import {
  getClasses,
  getOverview,
  getPendingCredentials,
  getRoster,
  getStudentDetail,
  issueCredential
} from "./assessors.controller.js";
import {
  generateCourseAssessment,
  getCourseAssessment,
  getCourseAssessments,
  postCourseAssessment,
  unpostCourseAssessment,
  updateCourseAssessment
} from "./assessments.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireOwnAssessor } from "./assessors.guard.js";

// Mounted at /api/assessors. :assessorId accepts the Mongo id or the ASS###
// number, so the client can pass whichever the auth session carries.
//
//   GET  /:assessorId/overview                              — profile + release counts
//   GET  /:assessorId/classes                               — assigned courses
//   GET  /:assessorId/classes/:courseId/roster              — enrolled students
//   GET  /:assessorId/classes/:courseId/students/:studentId — per-student detail
//
//   Generating and releasing a course's papers — see assessments.controller.js:
//   GET  /:assessorId/classes/:courseId/assessments               — lesson + final state
//   GET  /:assessorId/classes/:courseId/assessments/:id           — one paper, keys included
//   POST /:assessorId/classes/:courseId/assessments/generate      — write a draft
//   PUT  /:assessorId/classes/:courseId/assessments/:id           — correct questions
//   POST /:assessorId/classes/:courseId/assessments/:id/post      — release to the course
//   POST /:assessorId/classes/:courseId/assessments/:id/unpost    — take it back off
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
router.get("/:assessorId/classes/:courseId/students/:studentId", getStudentDetail);

// Generating is the only thing here that spends money, and it is a deliberate
// press by a member of staff who is watching the screen — the same shape the
// student's "Take the Quiz" had, moved to the person who reads the result.
router.get("/:assessorId/classes/:courseId/assessments", getCourseAssessments);
router.post("/:assessorId/classes/:courseId/assessments/generate", generateCourseAssessment);
router.get("/:assessorId/classes/:courseId/assessments/:assessmentId", getCourseAssessment);
router.put("/:assessorId/classes/:courseId/assessments/:assessmentId", updateCourseAssessment);
router.post("/:assessorId/classes/:courseId/assessments/:assessmentId/post", postCourseAssessment);
router.post("/:assessorId/classes/:courseId/assessments/:assessmentId/unpost", unpostCourseAssessment);

// A paper is marked against its key when it is handed in, and that mark is
// final — there is nothing here to reopen a submission with. A pass writes its
// own pending credential; these two are what an assessor does about it.
router.get("/:assessorId/credentials", getPendingCredentials);
router.post("/:assessorId/credentials/:submissionId/issue", issueCredential);

export default router;
