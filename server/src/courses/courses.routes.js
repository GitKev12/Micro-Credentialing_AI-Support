import { Router } from "express";
import { getStudentCourses, getStudentSkillGap } from "./courses.controller.js";

// Mounted at /api/students, so these resolve to:
//   GET /api/students/:id/courses    — course list (client fetchStudentCourses)
//   GET /api/students/:id/skill-gap  — dashboard analytics (client fetchStudentSkillGap)
const router = Router();

router.get("/:id/courses", getStudentCourses);
router.get("/:id/skill-gap", getStudentSkillGap);

export default router;
