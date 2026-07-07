import { Router } from "express";
import {
  getCourseAssessments,
  getCourseModules,
  getModuleFile
} from "./modules.controller.js";

// Mounted at /api, so these resolve to:
//   GET /api/courses/:courseId/modules      — lesson list for a course
//   GET /api/courses/:courseId/assessments  — assessment list for a course
//   GET /api/modules/:moduleId/file         — streams the lesson file (PDF)
const router = Router();

router.get("/courses/:courseId/modules", getCourseModules);
router.get("/courses/:courseId/assessments", getCourseAssessments);
router.get("/modules/:moduleId/file", getModuleFile);

export default router;
