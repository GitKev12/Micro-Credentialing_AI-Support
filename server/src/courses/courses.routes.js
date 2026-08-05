import { Router } from "express";
import {
  getStudentAchievements,
  getStudentCourses,
  getStudentSkillGap
} from "./courses.controller.js";

// Mounted at /api/students, so these resolve to:
//   GET /api/students/:id/courses      — course list (client fetchStudentCourses)
//   GET /api/students/:id/skill-gap    — dashboard analytics (client fetchStudentSkillGap)
//   GET /api/students/:id/achievements — certifications + badges
const router = Router();

router.get("/:id/courses", getStudentCourses);
router.get("/:id/skill-gap", getStudentSkillGap);
router.get("/:id/achievements", getStudentAchievements);

export default router;
