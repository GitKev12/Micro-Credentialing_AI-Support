import { Router } from "express";
import { getCoursePreAssessments, submitPreAssessment } from "./preAssessments.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireOwnStudent } from "../middleware/student.guard.js";

// Mounted at /api, so these resolve to:
//   GET  /api/students/:studentId/courses/:courseId/pre-assessments  — with the student's attempts
//   POST /api/students/:studentId/pre-assessments/:preAssessmentId/submit  { answers }
// The admin side lives in admin.routes.js.
const router = Router();

const ownWork = [requireAuth, requireOwnStudent("studentId")];

router.get("/students/:studentId/courses/:courseId/pre-assessments", ownWork, getCoursePreAssessments);
router.post("/students/:studentId/pre-assessments/:preAssessmentId/submit", ownWork, submitPreAssessment);

export default router;
