import express, { Router } from "express";
import {
  assignCourse,
  enrollStudent,
  generateAssessments,
  generateFinalAssessment,
  getAdminProfile,
  getAssessmentGenerationStatus,
  getAssessor,
  getCourse,
  getStudent,
  getTableOfSpecification,
  listAssessors,
  listCourses,
  listStudents,
  saveTableOfSpecification,
  unassignCourse,
  unenrollStudent,
  updateAssessor,
  updateStudent
} from "./admin.controller.js";
import {
  createCourseModule,
  deleteCourseModule,
  MAX_MODULE_BYTES
} from "./modules.controller.js";
import { getApiUsage } from "./usage.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

// Mounted at /api/admin, so these resolve to:
//   GET    /api/admin/profile
//   GET    /api/admin/courses                          — list + module/student counts
//   GET    /api/admin/courses/:id                      — course detail + modules
//   POST   /api/admin/courses/:id/modules              — add a lesson (PDF body)
//   DELETE /api/admin/modules/:moduleId                — remove a lesson
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
//   GET    /api/admin/assessments/status?courseId=     — what still needs a quiz
//   POST   /api/admin/assessments/generate             — write quizzes  { courseId, moduleId?, dryRun? }
//   POST   /api/admin/assessments/final                — assemble the final { courseId, dryRun? }
//   GET    /api/admin/api-usage?days=30                — token spend, from our own log
const router = Router();

// Every route below manages accounts and enrolment, so the whole router is
// admin-only. Nothing here is safe to expose to a signed-in student.
router.use(requireAuth, requireRole("admin"));

router.get("/profile", getAdminProfile);

/**
 * The lesson file is the request body, not a form field — see
 * `createCourseModule`. Any content type is buffered, because the PDF check
 * that matters reads the file's first bytes rather than the label the browser
 * put on them; the limit is what stops an oversized upload from becoming an
 * oversized buffer. Body-parser rejects that with an HTML error page by
 * default, so it is answered here in the JSON every other route speaks.
 */
const lessonFileBody = express.raw({ type: () => true, limit: MAX_MODULE_BYTES });

function readLessonFile(request, response, next) {
  lessonFileBody(request, response, (error) => {
    if (error?.type === "entity.too.large") {
      return response.status(413).json({
        message: `That file is too large — the limit is ${Math.round(
          MAX_MODULE_BYTES / (1024 * 1024)
        )} MB.`
      });
    }
    return next(error);
  });
}

router.get("/courses", listCourses);
router.get("/courses/:id", getCourse);
router.post("/courses/:id/modules", readLessonFile, createCourseModule);
router.delete("/modules/:moduleId", deleteCourseModule);

router.get("/students", listStudents);
router.get("/students/:id", getStudent);
router.patch("/students/:id", updateStudent);
router.post("/students/:id/courses", enrollStudent);
router.delete("/students/:id/courses/:courseId", unenrollStudent);

router.get("/assessors", listAssessors);
router.get("/assessors/:id", getAssessor);
router.patch("/assessors/:id", updateAssessor);
router.post("/assessors/:id/courses", assignCourse);
router.delete("/assessors/:id/courses/:courseId", unassignCourse);

router.get("/table-of-specification", getTableOfSpecification);
router.put("/table-of-specification", saveTableOfSpecification);

// The only routes in the system that can spend money. Admin-only, like the
// rest of this router, and every one of them accepts dryRun.
router.get("/assessments/status", getAssessmentGenerationStatus);
router.post("/assessments/generate", generateAssessments);
router.post("/assessments/final", generateFinalAssessment);

// Reads the spend log, not OpenAI. Refreshing it costs nothing, which is the
// point of a monitor.
router.get("/api-usage", getApiUsage);

export default router;
