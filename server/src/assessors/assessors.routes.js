import { Router } from "express";
import {
  getClasses,
  getOverview,
  getPendingCredentials,
  getQueue,
  getRoster,
  getStudentDetail,
  getSubmission,
  issueCredential,
  releaseConfident,
  saveReview
} from "./assessors.controller.js";

// Mounted at /api/assessors. :assessorId accepts the Mongo id or the ASS###
// number, so the client can pass whichever the auth session carries.
//
//   GET  /:assessorId/overview                              — profile + to-grade counts
//   GET  /:assessorId/classes                               — assigned courses
//   GET  /:assessorId/classes/:courseId/roster              — enrolled students
//   GET  /:assessorId/classes/:courseId/students/:studentId — per-student detail
//   GET  /:assessorId/queue                                 — submissions to grade
//   POST /:assessorId/queue/release-confident               — accept all flag-free AI grades
//   GET  /:assessorId/submissions/:submissionId             — full review payload
//   PUT  /:assessorId/submissions/:submissionId/review      — { action: "draft"|"release",
//                                                              overrides?, finalScore?, remark? }
//   GET  /:assessorId/credentials                           — approved grades awaiting issue
//   POST /:assessorId/credentials/:submissionId/issue       — issue the micro-credential
const router = Router();

router.get("/:assessorId/overview", getOverview);

router.get("/:assessorId/classes", getClasses);
router.get("/:assessorId/classes/:courseId/roster", getRoster);
router.get("/:assessorId/classes/:courseId/students/:studentId", getStudentDetail);

router.get("/:assessorId/queue", getQueue);
router.post("/:assessorId/queue/release-confident", releaseConfident);

router.get("/:assessorId/submissions/:submissionId", getSubmission);
router.put("/:assessorId/submissions/:submissionId/review", saveReview);

router.get("/:assessorId/credentials", getPendingCredentials);
router.post("/:assessorId/credentials/:submissionId/issue", issueCredential);

export default router;
