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
  getStudentImpact,
  setAssessorSuspension,
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
import { requireAuth, requireRole } from "../middleware/auth.js";

// Mounted at /api/admin, so these resolve to:
//   GET    /api/admin/profile
//   GET    /api/admin/courses                          — list + module/student counts
//   POST   /api/admin/courses                          — create   { code, title, description?, startsOn?, endsOn? }
//   GET    /api/admin/courses/:id                      — course detail + modules
//   PATCH  /api/admin/courses/:id                      — edit     { code?, title?, description?, startsOn?, endsOn? }
//   GET    /api/admin/courses/:id/impact               — what deleting it would take
//   DELETE /api/admin/courses/:id                      — delete the course
//   PUT    /api/admin/courses/:id/image                — set the card picture (image body)
//   DELETE /api/admin/courses/:id/image                — back to the placeholder
//   POST   /api/admin/courses/:id/modules              — add a lesson (PDF body)
//   GET    /api/admin/modules/:moduleId/impact         — what deleting it would take
//   DELETE /api/admin/modules/:moduleId                — remove a lesson
//   GET    /api/admin/students                         — list
//   POST   /api/admin/students                         — create   { firstName, lastName, email, studentNumber?, password }
//   GET    /api/admin/students/:id                     — detail + progress
//   PATCH  /api/admin/students/:id                     — edit     { names, email, studentNumber, password }
//   PATCH  /api/admin/students/:id/suspension          — lock/unlock { suspended }
//   GET    /api/admin/students/:id/impact              — what deleting them would take
//   DELETE /api/admin/students/:id                     — delete the account and their records
//   GET    /api/admin/assessors                        — list
//   POST   /api/admin/assessors                        — create   { name, email, assessorNumber?, password }
//   GET    /api/admin/assessors/:id                    — detail
//   PATCH  /api/admin/assessors/:id                    — edit     { name, email, assessorNumber, password }
//   PATCH  /api/admin/assessors/:id/suspension         — lock/unlock { suspended }
//   GET    /api/admin/assessors/:id/impact             — what deleting them would take
//   DELETE /api/admin/assessors/:id                    — delete the account, off every class
//   GET    /api/admin/classes                          — list, joined to course + assessors
//   POST   /api/admin/classes                          — create   { name, courseId, assessorIds, studentIds, schedule }
//   GET    /api/admin/classes/:id                      — detail (full assessor + student lists)
//   PATCH  /api/admin/classes/:id                      — edit     { name?, courseId?, assessorIds?, studentIds?, schedule? }
//   GET    /api/admin/classes/:id/impact               — what deleting it would unenroll/unassign
//   DELETE /api/admin/classes/:id                      — delete the class, reconcile links
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
// Every destructive route has an /impact twin. What a delete costs has to be
// readable before it is agreed to — reporting it afterwards is not consent.
router.get("/courses/:id/impact", getCourseImpact);
router.delete("/courses/:id", deleteCourse);
router.put("/courses/:id/image", readCourseImage, setCourseImage);
router.delete("/courses/:id/image", removeCourseImage);
router.post("/courses/:id/modules", readLessonFile, createCourseModule);
router.get("/modules/:moduleId/impact", getModuleImpact);
router.delete("/modules/:moduleId", deleteCourseModule);

// No create and no delete for either roster: provisioning accounts is outside
// this system, and with no way to make one, a delete would be a door with no
// way back. Correcting an existing record is what these routes govern — who is
// enrolled or assigned is settled by the class, below, and there is no second
// way in here to put a person on a course without one.
router.get("/students", listStudents);
router.post("/students", createStudent);
router.get("/students/:id", getStudent);
router.patch("/students/:id", updateStudent);
router.patch("/students/:id/suspension", setStudentSuspension);
router.get("/students/:id/impact", getStudentImpact);
router.delete("/students/:id", deleteStudent);

router.get("/assessors", listAssessors);
router.post("/assessors", createAssessor);
router.get("/assessors/:id", getAssessor);
router.patch("/assessors/:id", updateAssessor);
router.patch("/assessors/:id/suspension", setAssessorSuspension);
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
