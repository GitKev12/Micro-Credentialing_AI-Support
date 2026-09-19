import mongoose from "mongoose";
import { idCandidates } from "../lib/mongo.js";
import { CERTIFICATE_FIELDS, fillCertificate } from "./certificates.fill.js";
import {
  certificateValues,
  findCertificateTemplate,
  findIssuedCertificate,
  listIssuedCertificates,
  readGridFsFile
} from "./certificates.service.js";

/**
 * Certificate endpoints.
 *
 *   GET /api/students/:id/certificates            — what this student holds
 *   GET /api/students/:id/certificates/:certId/file — the stamped PDF
 *   GET /api/certificates/template/preview        — the blank, filled with
 *                                                   sample values
 *
 * The preview exists so a template can be checked before anyone relies on it:
 * open it and see exactly where the fixed coordinates in certificates.fill.js
 * put each value. Without it the first proof that the positions are right
 * would be a student's real certificate.
 */
const STUDENTS_COLLECTION = "Student";

export async function getStudentCertificates(request, response) {
  const certificates = await listIssuedCertificates(request.params.id);
  return response.json({ certificates });
}

export async function getStudentCertificateFile(request, response) {
  const certificate = await findIssuedCertificate(request.params.certificateId);

  if (!certificate) {
    return response.status(404).json({ message: "Certificate not found." });
  }

  // The path is scoped to a student, so the row has to belong to them —
  // otherwise any id would hand out anyone's certificate.
  const owns = idCandidates(request.params.id)
    .map(String)
    .includes(String(certificate.studentId));

  if (!owns) {
    return response.status(404).json({ message: "Certificate not found." });
  }

  response.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${certificate.filename}"`,
    "Cache-Control": "private, max-age=3600"
  });

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: certificate.bucket
  });
  const stream = bucket.openDownloadStream(certificate.fileId);

  stream.on("error", () => {
    if (!response.headersSent) {
      response.status(404).json({ message: "Certificate file is missing from storage." });
    } else {
      response.end();
    }
  });

  return stream.pipe(response);
}

/**
 * Renders the blank with stand-in values so the positions can be checked.
 * Pass ?studentId= to preview a real student's details instead.
 */
export async function previewCertificateTemplate(request, response) {
  const template = await findCertificateTemplate(request.query.courseId);

  if (!template) {
    return response.status(404).json({ message: "No certificate template is stored." });
  }

  const templateBuffer = await readGridFsFile(template.bucket, template.fileId);

  const student = request.query.studentId
    ? await mongoose.connection
        .collection(STUDENTS_COLLECTION)
        .findOne({ _id: { $in: idCandidates(request.query.studentId) } })
    : null;

  const sampleCourse = {
    courseCode: request.query.courseCode ?? "SAMPLE",
    courseName: request.query.courseName ?? "Sample Course Name"
  };

  const values = certificateValues({
    student: student ?? { first_name: "Sample", last_name: "Student Name" },
    course: sampleCourse,
    assessor: { name: "Authorized Assessor" },
    issuedAt: new Date()
  });

  const { bytes } = await fillCertificate(templateBuffer, values);

  response.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": 'inline; filename="certificate-preview.pdf"',
    "Cache-Control": "no-store"
  });

  return response.send(bytes);
}

/** Where each value is written, for checking a template without opening a PDF. */
export async function getCertificateTemplateLayout(request, response) {
  const template = await findCertificateTemplate(request.query.courseId);

  if (!template) {
    return response.status(404).json({ message: "No certificate template is stored." });
  }

  return response.json({
    template: { id: String(template._id), title: template.title, filename: template.filename },
    fields: CERTIFICATE_FIELDS
  });
}
