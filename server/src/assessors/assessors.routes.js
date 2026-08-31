import { Router } from "express";
import {
  getClasses,
  getOverview,
  getPendingCredentials,
  getRoster,
  getStudentDetail,
  getSubmission,
  issueCredential,
  saveReview
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
//   GET  /:assessorId/submissions/:submissionId             — full review payload
//   PUT  /:assessorId/submissions/:submissionId/review      — { action: "draft"|"release",
//                                                              overrides?, finalScore? }
//   GET  /:assessorId/credentials                           — approved grades awaiting issue
//   POST /:assessorId/credentials/:submissionId/issue       — issue the micro-credential
const router = Router();

// Grading, review and credential issuing are staff work.
//
// This guards the *role*, not the individual: because :assessorId accepts
// either the Mongo id or the ASS### number, matching it against the session id
// would reject half the client's own calls. One assessor can therefore still
// read another's queue — a narrower problem than the open API this replaces,
// and one to close once the client settles on a single id form.
router.use(requireAuth, requireRole("assessor", "admin"));

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

router.get("/:assessorId/submissions/:submissionId", getSubmission);
router.put("/:assessorId/submissions/:submissionId/review", saveReview);

router.get("/:assessorId/credentials", getPendingCredentials);
router.post("/:assessorId/credentials/:submissionId/issue", issueCredential);

export default router;
