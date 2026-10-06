import express, { Router } from "express";
import {
  generateAssessments,
  generateFinalAssessment,
  getAdminProfile,
  getAssessmentGenerationStatus,
  getAssessor,
  getCourse,
  getStudent,
  listAssessors,
  listCourses,
  listStudents
} from "./admin.controller.js";
import {
  createAssessor,
  createStudent,
  deleteAssessor,
  deleteStudent,
  getAssessorImpact,
  getNextAssessorId,
  getNextStudentId,
  getStudentImpact,
  setAssessorStatus,
  setAssessorSuspension,
  setStudentStatus,
  setStudentSuspension,
  updateAssessor,
  updateStudent
} from "./accounts.controller.js";
import {
  createCourse,
  createCourseModule,
  deleteCourse,
  deleteCourseModule,
  getCourseImpact,
  getModuleImpact,
  removeCourseImage,
  setCourseImage,
  setCourseStatus,
  updateCourse,
  MAX_COURSE_IMAGE_BYTES,
  MAX_MODULE_BYTES
} from "./modules.controller.js";
import {
  createClass,
  deleteClass,
  getClass,
  getClassImpact,
  listClasses,
  updateClass
} from "./classes.controller.js";
import { listDiscoverClasses, setClassDiscover, acceptEnrollRequest, declineEnrollRequest } from "./discover.controller.js";
import { deleteModuleBadge, saveModuleBadge } from "./badges.controller.js";
import {
  deleteModulePreAssessment,
  getModulePreAssessment,
  saveModulePreAssessment
} from "../preAssessments/preAssessments.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

// Mounted at /api/admin, so these resolve to:
//   GET    /api/admin/profile
//   GET    /api/admin/courses                          — list + module/student counts
//   POST   /api/admin/courses                          — create   { code, title, description?, startsOn?, endsOn? }
//   GET    /api/admin/courses/:id                      — course detail + modules
//   PATCH  /api/admin/courses/:id                      — edit     { code?, title?, description?, startsOn?, endsOn? }
//   PATCH  /api/admin/courses/:id/status               — { status: active | inactive | archived }
//   GET    /api/admin/courses/:id/impact               — what deleting it would take
//   DELETE /api/admin/courses/:id                      — delete an archived course
//   PUT    /api/admin/courses/:id/image                — set the card picture (image body)
//   DELETE /api/admin/courses/:id/image                — back to the placeholder
//   POST   /api/admin/courses/:id/modules              — add a lesson (PDF body)
//   GET    /api/admin/modules/:moduleId/impact         — what deleting it would take
//   DELETE /api/admin/modules/:moduleId                — remove a lesson
//   PUT    /api/admin/modules/:moduleId/badge          — add or edit its badge { title, description, icon?, active }
//   DELETE /api/admin/modules/:moduleId/badge          — remove its badge
//   GET    /api/admin/modules/:moduleId/pre-assessment — its 1–5 questions
//   PUT    /api/admin/modules/:moduleId/pre-assessment — save { items, active }
//   DELETE /api/admin/modules/:moduleId/pre-assessment — remove it and its attempts
//   GET    /api/admin/students                         — list
//   POST   /api/admin/students                         — create   { firstName, lastName, email, studentNumber?, password }
//   GET    /api/admin/students/next-id                 — the ID a new student would get
//   GET    /api/admin/students/:id                     — detail + progress
//   PATCH  /api/admin/students/:id                     — edit     { names, email, studentNumber, password }
//   PATCH  /api/admin/students/:id/suspension          — lock/unlock { suspended }
//   PATCH  /api/admin/students/:id/status              — { status: active | inactive | archived }
//   GET    /api/admin/students/:id/impact              — what deleting them would take
//   DELETE /api/admin/students/:id                     — delete an archived student
//   GET    /api/admin/assessors                        — list
//   POST   /api/admin/assessors                        — create   { name, email, assessorNumber?, password }
//   GET    /api/admin/assessors/next-id                — the ID a new assessor would get
//   GET    /api/admin/assessors/:id                    — detail
//   PATCH  /api/admin/assessors/:id                    — edit     { name, email, assessorNumber, password }
//   PATCH  /api/admin/assessors/:id/suspension         — lock/unlock { suspended }
//   PATCH  /api/admin/assessors/:id/status             — { status: active | inactive | archived }
//   GET    /api/admin/assessors/:id/impact             — what deleting them would take
//   DELETE /api/admin/assessors/:id                    — delete an archived assessor
//   GET    /api/admin/classes                          — list, joined to course + assessors
//   POST   /api/admin/classes                          — create   { name, courseId, assessorIds, studentIds, schedule }
//   GET    /api/admin/classes/:id                      — detail (full assessor + student lists)
//   PATCH  /api/admin/classes/:id                      — edit     { assessorIds?, studentIds?, schedule?, active?, archived? }
//   GET    /api/admin/classes/:id/impact               — what deleting it would unenrol
//   DELETE /api/admin/classes/:id                      — delete an archived class
//   GET    /api/admin/discover                         — classes with their Discover settings + requests
//   PATCH  /api/admin/classes/:id/discover             — post / unpost  { posted?, enrollment? }
//   POST   /api/admin/classes/:id/requests/:studentId/accept|decline — answer a request
//   GET    /api/admin/assessments/status?courseId=     — what still needs a quiz
//   POST   /api/admin/assessments/generate             — write quizzes  { courseId, moduleId?, dryRun? }
//   POST   /api/admin/assessments/final                — assemble the final { courseId, dryRun? }
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

/** The same arrangement for a course picture, at its own smaller limit. */
const courseImageBody = express.raw({ type: () => true, limit: MAX_COURSE_IMAGE_BYTES });

function readCourseImage(request, response, next) {
  courseImageBody(request, response, (error) => {
    if (error?.type === "entity.too.large") {
      return response.status(413).json({
        message: `That picture is too large — the limit is ${Math.round(
          MAX_COURSE_IMAGE_BYTES / (1024 * 1024)
        )} MB.`
      });
    }
    return next(error);
  });
}

router.get("/courses", listCourses);
router.post("/courses", createCourse);
router.get("/courses/:id", getCourse);
router.patch("/courses/:id", updateCourse);
router.patch("/courses/:id/status", setCourseStatus);
router.get("/courses/:id/impact", getCourseImpact);
router.delete("/courses/:id", deleteCourse);
// Every destructive route has an /impact twin. What a delete costs has to be
// readable before it is agreed to — reporting it afterwards is not consent.
router.put("/courses/:id/image", readCourseImage, setCourseImage);
router.delete("/courses/:id/image", removeCourseImage);
router.post("/courses/:id/modules", readLessonFile, createCourseModule);
router.get("/modules/:moduleId/impact", getModuleImpact);
router.delete("/modules/:moduleId", deleteCourseModule);
router.put("/modules/:moduleId/badge", saveModuleBadge);
router.delete("/modules/:moduleId/badge", deleteModuleBadge);
router.get("/modules/:moduleId/pre-assessment", getModulePreAssessment);
router.put("/modules/:moduleId/pre-assessment", saveModulePreAssessment);
router.delete("/modules/:moduleId/pre-assessment", deleteModulePreAssessment);

// Delete only works on an archived account (see /status).
// Who is enrolled or assigned is settled by the class, below.
router.get("/students", listStudents);
router.post("/students", createStudent);
// Before "/students/:id", so "next-id" isn't read as an id.
router.get("/students/next-id", getNextStudentId);
router.get("/students/:id", getStudent);
router.patch("/students/:id", updateStudent);
router.patch("/students/:id/suspension", setStudentSuspension);
router.patch("/students/:id/status", setStudentStatus);
router.get("/students/:id/impact", getStudentImpact);
router.delete("/students/:id", deleteStudent);

router.get("/assessors", listAssessors);
router.get("/assessors/next-id", getNextAssessorId);
router.post("/assessors", createAssessor);
router.get("/assessors/:id", getAssessor);
router.patch("/assessors/:id", updateAssessor);
router.patch("/assessors/:id/suspension", setAssessorSuspension);
router.patch("/assessors/:id/status", setAssessorStatus);
router.get("/assessors/:id/impact", getAssessorImpact);
router.delete("/assessors/:id", deleteAssessor);

// A class ties a course to its assessors and students in one place, instead of
// enrolling students on one screen and assigning assessors on another. It writes
// through to enrolledCourses / assigned_courses (see classes.controller.js), so
// every screen that already reads those keeps working unchanged. Its schedule is
// a stored label, not a release rule — quizzes still open per student on lesson
// completion.
router.get("/classes", listClasses);
// Before /classes/:id, or "log" is read as a class id.
router.post("/classes", createClass);
router.get("/classes/:id", getClass);
router.patch("/classes/:id", updateClass);
router.get("/classes/:id/impact", getClassImpact);
router.delete("/classes/:id", deleteClass);

// Discover: the admin posts a class for students to find and join, and
// accepts or declines their requests (see discover.controller.js).
router.get("/discover", listDiscoverClasses);
router.patch("/classes/:id/discover", setClassDiscover);
router.post("/classes/:id/requests/:studentId/accept", acceptEnrollRequest);
router.post("/classes/:id/requests/:studentId/decline", declineEnrollRequest);

/**
 * Authoring, not scheduling — and deliberately not on a screen.
 *
 * These write the questions for a lesson, once, ahead of anyone taking them.
 * They decide nothing about *when* a student sits a quiz: that is settled per
 * student by the lock, which opens when they finish reading the lesson. There
 * is no class schedule and no release date in this system, so there is nothing
 * for an admin to time and no console page for these.
 *
 * They stay as endpoints because a quiz has to be written before it can be
 * unlocked, and this is the only thing that writes one. Run them once per
 * course during setup.
 *
 * The only routes in the system that can spend money. Admin-only, like the rest
 * of this router, and every one of them accepts dryRun.
 */
router.get("/assessments/status", getAssessmentGenerationStatus);
router.post("/assessments/generate", generateAssessments);
router.post("/assessments/final", generateFinalAssessment);

export default router;
