import { Router } from "express";
import {
  getCourseAssessments,
  getCourseModules,
  getCourseProgress,
  getModuleFile,
  getModuleText,
  markModuleComplete,
  unmarkModuleComplete
} from "./modules.controller.js";

// Mounted at /api, so these resolve to:
//   GET    /api/courses/:courseId/modules      — lesson list for a course
//   GET    /api/courses/:courseId/assessments  — assessment list for a course
//   GET    /api/modules/:moduleId/file         — streams the lesson file (PDF)
//   GET    /api/modules/:moduleId/text         — OCR text + lesson blocks, cached
//   GET    /api/students/:studentId/courses/:courseId/progress — completed lessons
//   POST   /api/students/:studentId/modules/:moduleId/complete — mark complete
//   DELETE /api/students/:studentId/modules/:moduleId/complete — unmark
const router = Router();

router.get("/courses/:courseId/modules", getCourseModules);
router.get("/courses/:courseId/assessments", getCourseAssessments);
router.get("/modules/:moduleId/file", getModuleFile);
router.get("/modules/:moduleId/text", getModuleText);
router.get("/students/:studentId/courses/:courseId/progress", getCourseProgress);
router.post("/students/:studentId/modules/:moduleId/complete", markModuleComplete);
router.delete("/students/:studentId/modules/:moduleId/complete", unmarkModuleComplete);

export default router;
