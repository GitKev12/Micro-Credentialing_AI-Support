import { Router } from "express";
import {
  getCourseAssessments,
  getCourseImage,
  getCourseModules,
  getCourseProgress,
  getModuleFigure,
  getModuleFile,
  getModuleSections,
  getModuleText,
  markModuleComplete,
  unmarkModuleComplete
} from "./modules.controller.js";
import { requireAuth, requireDownloadAuth, requireSelfOrRole } from "../middleware/auth.js";

// Mounted at /api, so these resolve to:
//   GET    /api/courses/:courseId/modules      — lesson list for a course
//   GET    /api/courses/:courseId/assessments  — assessment list for a course
//   GET    /api/modules/:moduleId/file         — streams the lesson file (PDF)
//   GET    /api/modules/:moduleId/text         — OCR text + lesson blocks, cached
//   GET    /api/modules/:moduleId/sections     — section list for the dropdown
//   GET    /api/students/:studentId/courses/:courseId/progress — completed lessons
//   POST   /api/students/:studentId/modules/:moduleId/complete — mark complete
//   DELETE /api/students/:studentId/modules/:moduleId/complete — unmark
const router = Router();

// Course material is readable by anyone signed in — the OCR routes are the
// expensive ones, and leaving them open invites strangers to spend the
// server's memory for us.
const signedIn = [requireAuth];

// The browser loads these itself, as <img src> and <a href>, so they take the
// token on the query string instead of in a header.
const browserFetched = [requireDownloadAuth];

// Progress belongs to one student; staff may read and amend it too.
const ownProgress = [requireAuth, requireSelfOrRole("studentId", "assessor", "admin")];

router.get("/courses/:courseId/modules", signedIn, getCourseModules);
router.get("/courses/:courseId/assessments", signedIn, getCourseAssessments);
router.get("/courses/:courseId/image", browserFetched, getCourseImage);
router.get("/modules/:moduleId/file", browserFetched, getModuleFile);
router.get("/modules/:moduleId/text", signedIn, getModuleText);
router.get("/modules/:moduleId/sections", signedIn, getModuleSections);
router.get("/modules/:moduleId/figures/:figureId", browserFetched, getModuleFigure);
router.get("/students/:studentId/courses/:courseId/progress", ownProgress, getCourseProgress);
router.post("/students/:studentId/modules/:moduleId/complete", ownProgress, markModuleComplete);
router.delete("/students/:studentId/modules/:moduleId/complete", ownProgress, unmarkModuleComplete);

export default router;
