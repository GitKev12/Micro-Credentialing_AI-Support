import { Router } from "express";
import {
  getCertificateTemplateLayout,
  getStudentCertificateFile,
  getStudentCertificates,
  previewCertificateTemplate
} from "./certificates.controller.js";

// Mounted at /api, so these resolve to:
//   GET /api/students/:id/certificates                  — issued certificates
//   GET /api/students/:id/certificates/:certificateId/file — the stamped PDF
//   GET /api/certificates/template/preview              — blank + sample values
//   GET /api/certificates/template/layout               — the detected fields
const router = Router();

router.get("/students/:id/certificates", getStudentCertificates);
router.get("/students/:id/certificates/:certificateId/file", getStudentCertificateFile);
router.get("/certificates/template/preview", previewCertificateTemplate);
router.get("/certificates/template/layout", getCertificateTemplateLayout);

export default router;
