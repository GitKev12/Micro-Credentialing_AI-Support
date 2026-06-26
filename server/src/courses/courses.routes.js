import { Router } from "express";
import { getStudentCourses } from "./courses.controller.js";

// Mounted at /api/students, so this resolves to GET /api/students/:id/courses
// — the same URL the client's fetchStudentCourses() points at.
const router = Router();

router.get("/:id/courses", getStudentCourses);

export default router;
