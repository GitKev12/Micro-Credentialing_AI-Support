import { Router } from "express";
import {
  assignCourse,
  enrollStudent,
  getAdminProfile,
  getAssessor,
  getCourse,
  getStudent,
  getTableOfSpecification,
  listAssessors,
  listCourses,
  listStudents,
  saveTableOfSpecification,
  unassignCourse,
  unenrollStudent
} from "./admin.controller.js";

// Mounted at /api/admin, so these resolve to:
//   GET    /api/admin/profile
//   GET    /api/admin/courses                          — list + module/student counts
//   GET    /api/admin/courses/:id                      — course detail + modules
//   GET    /api/admin/students                         — list
//   GET    /api/admin/students/:id                     — detail + progress
//   POST   /api/admin/students/:id/courses             — enroll   { courseId }
//   DELETE /api/admin/students/:id/courses/:courseId   — unenroll
//   GET    /api/admin/assessors                        — list
//   GET    /api/admin/assessors/:id                    — detail
//   POST   /api/admin/assessors/:id/courses            — assign   { courseId }
//   DELETE /api/admin/assessors/:id/courses/:courseId  — unassign
//   GET    /api/admin/table-of-specification           — blueprint
//   PUT    /api/admin/table-of-specification           — save blueprint
const router = Router();

router.get("/profile", getAdminProfile);

router.get("/courses", listCourses);
router.get("/courses/:id", getCourse);

router.get("/students", listStudents);
router.get("/students/:id", getStudent);
router.post("/students/:id/courses", enrollStudent);
router.delete("/students/:id/courses/:courseId", unenrollStudent);

router.get("/assessors", listAssessors);
router.get("/assessors/:id", getAssessor);
router.post("/assessors/:id/courses", assignCourse);
router.delete("/assessors/:id/courses/:courseId", unassignCourse);

router.get("/table-of-specification", getTableOfSpecification);
router.put("/table-of-specification", saveTableOfSpecification);

export default router;
