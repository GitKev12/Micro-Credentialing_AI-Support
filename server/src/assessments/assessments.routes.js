import { Router } from "express";
import {
  getAssessmentForStudent,
  getCourseAssessmentsForStudent,
  submitAssessment
} from "./assessments.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireOwnStudent } from "../middleware/student.guard.js";

// Mounted at /api, so these resolve to:
//   GET  /api/students/:studentId/courses/:courseId/assessments — rail rows,
//                                              each with its lock and result
//   GET  /api/students/:studentId/assessments/:assessmentId     — the questions
//   POST /api/students/:studentId/assessments/:assessmentId/submit
//
// Nothing here writes a quiz. A student used to be able to spend a model call
// by pressing "Take the Quiz" on a lesson they had finished; papers are now
// generated and released by the assessor, so the student side only ever reads.
const router = Router();

// A student's own quizzes; their assessor's, and an admin's, to look at. Not
// every assessor's — teaching them is the claim, not being staff (see
// student.guard.js).
const ownWork = [requireAuth, requireOwnStudent("studentId")];

router.get("/students/:studentId/courses/:courseId/assessments", ownWork, getCourseAssessmentsForStudent);

router.get("/students/:studentId/assessments/:assessmentId", ownWork, getAssessmentForStudent);
router.post("/students/:studentId/assessments/:assessmentId/submit", ownWork, submitAssessment);

export default router;
