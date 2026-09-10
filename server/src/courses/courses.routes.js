import { Router } from "express";
import {
  getStudentAchievements,
  getStudentCourses,
  getStudentSkillGap
} from "./courses.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireOwnStudent } from "../middleware/student.guard.js";

// Mounted at /api/students, so these resolve to:
//   GET /api/students/:id/courses      — course list (client fetchStudentCourses)
//   GET /api/students/:id/skill-gap    — dashboard analytics (client fetchStudentSkillGap)
//   GET /api/students/:id/achievements — certifications + badges
const router = Router();

// A student's own record, their assessor's, or anyone's if you are an admin —
// being staff is not on its own a claim on a student (see student.guard.js).
const ownRecord = [requireAuth, requireOwnStudent("id")];

router.get("/:id/courses", ownRecord, getStudentCourses);
router.get("/:id/skill-gap", ownRecord, getStudentSkillGap);
router.get("/:id/achievements", ownRecord, getStudentAchievements);

export default router;
