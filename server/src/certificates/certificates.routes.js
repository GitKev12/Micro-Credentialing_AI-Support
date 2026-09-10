import { Router } from "express";
import {
  getCertificateTemplateLayout,
  getStudentCertificateFile,
  getStudentCertificates,
  previewCertificateTemplate
} from "./certificates.controller.js";
import { requireAuth, requireDownloadAuth, requireRole } from "../middleware/auth.js";
import { requireOwnStudent } from "../middleware/student.guard.js";

// Mounted at /api, so these resolve to:
//   GET /api/students/:id/certificates                  — issued certificates
//   GET /api/students/:id/certificates/:certificateId/file — the stamped PDF
//   GET /api/certificates/template/preview              — blank + sample values
//   GET /api/certificates/template/layout               — the detected fields
const router = Router();

router.get(
  "/students/:id/certificates",
  requireAuth,
  requireOwnStudent("id"),
  getStudentCertificates
);

// Opened in a tab by the browser, so this one takes ?token= (see tokens.js).
router.get(
  "/students/:id/certificates/:certificateId/file",
  requireDownloadAuth,
  requireOwnStudent("id"),
  getStudentCertificateFile
);

// Template introspection is an authoring concern, not a student-facing one.
router.get(
  "/certificates/template/preview",
  requireDownloadAuth,
  requireRole("assessor", "admin"),
  previewCertificateTemplate
);
router.get(
  "/certificates/template/layout",
  requireAuth,
  requireRole("assessor", "admin"),
  getCertificateTemplateLayout
);

export default router;
