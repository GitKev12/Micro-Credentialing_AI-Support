import { Router } from "express";
import {
  getStudentAchievements,
  getStudentCourses,
  getStudentSkillGap
} from "./courses.controller.js";
import { requireAuth, requireSelfOrRole } from "../middleware/auth.js";

// Mounted at /api/students, so these resolve to:
//   GET /api/students/:id/courses      — course list (client fetchStudentCourses)
//   GET /api/students/:id/skill-gap    — dashboard analytics (client fetchStudentSkillGap)
//   GET /api/students/:id/achievements — certifications + badges
const router = Router();

// A student's own progress, or any student's if you are staff.
const ownRecord = [requireAuth, requireSelfOrRole("id", "assessor", "admin")];

router.get("/:id/courses", ownRecord, getStudentCourses);
router.get("/:id/skill-gap", ownRecord, getStudentSkillGap);
router.get("/:id/achievements", ownRecord, getStudentAchievements);

export default router;
