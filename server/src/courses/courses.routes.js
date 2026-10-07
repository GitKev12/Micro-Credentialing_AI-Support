import { Router } from "express";
import {
  getStudentAchievements,
  getStudentCourses,
  getStudentSkillGap
} from "./courses.controller.js";
import {
  cancelEnrollRequest,
  enrollInCourse,
  getDiscoverCourse,
  listDiscoverCourses
} from "./discover.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireOwnStudent } from "../middleware/student.guard.js";

// Mounted at /api/students, so these resolve to:
//   GET /api/students/:id/courses      — course list (client fetchStudentCourses)
//   GET /api/students/:id/skill-gap    — dashboard analytics (client fetchStudentSkillGap)
//   GET /api/students/:id/achievements — certifications + badges
//   GET /api/students/:id/discover (+ /:courseId), POST .../discover/:courseId/enroll,
//   DELETE .../discover/:courseId/request — Discover (see discover.controller.js)
const router = Router();

// A student's own record, their assessor's, or anyone's if you are an admin —
// being staff is not on its own a claim on a student (see student.guard.js).
const ownRecord = [requireAuth, requireOwnStudent("id")];

router.get("/:id/courses", ownRecord, getStudentCourses);
router.get("/:id/skill-gap", ownRecord, getStudentSkillGap);
router.get("/:id/achievements", ownRecord, getStudentAchievements);

// Joining a course is the student's own choice, so only the student may do it.
const ownWrite = [requireAuth, requireRole("student"), requireOwnStudent("id")];

router.get("/:id/discover", ownRecord, listDiscoverCourses);
router.get("/:id/discover/:courseId", ownRecord, getDiscoverCourse);
// By course and pathway, not by class: the student never sees a section, so
// there is no class id for them to send.
router.post("/:id/discover/:courseId/enroll", ownWrite, enrollInCourse);
router.delete("/:id/discover/:courseId/request", ownWrite, cancelEnrollRequest);

export default router;
