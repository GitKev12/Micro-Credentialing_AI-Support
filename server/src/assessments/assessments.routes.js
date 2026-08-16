import { Router } from "express";
import {
  getAssessmentForStudent,
  getCourseAssessmentsForStudent,
  prepareLessonAssessment,
  submitAssessment
} from "./assessments.controller.js";
import { requireAuth, requireSelfOrRole } from "../middleware/auth.js";

// Mounted at /api, so these resolve to:
//   GET  /api/students/:studentId/courses/:courseId/assessments — rail rows,
//                                              each with its lock and result
//   POST /api/students/:studentId/modules/:moduleId/assessment  — "Take the
//                                              Quiz": writes it, then returns it
//   GET  /api/students/:studentId/assessments/:assessmentId     — the questions
//   POST /api/students/:studentId/assessments/:assessmentId/submit
const router = Router();

// A student's own quizzes; staff may look at anyone's.
const ownWork = [requireAuth, requireSelfOrRole("studentId", "assessor", "admin")];

router.get("/students/:studentId/courses/:courseId/assessments", ownWork, getCourseAssessmentsForStudent);

// The only route a student can reach that spends money, and it takes a
// deliberate press to get here — see prepareLessonAssessment.
router.post("/students/:studentId/modules/:moduleId/assessment", ownWork, prepareLessonAssessment);

router.get("/students/:studentId/assessments/:assessmentId", ownWork, getAssessmentForStudent);
router.post("/students/:studentId/assessments/:assessmentId/submit", ownWork, submitAssessment);

export default router;
