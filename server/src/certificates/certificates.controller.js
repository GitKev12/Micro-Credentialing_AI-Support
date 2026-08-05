import mongoose from "mongoose";
import { idCandidates } from "../lib/mongo.js";
import {
  certificateValues,
  fillCertificate,
  findCertificateTemplate,
  findIssuedCertificate,
  getCertificateLayout,
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
 * upload a redesigned blank, open the preview, and see exactly where the OCR
 * decided each value belongs. Without it the first proof that a new template
 * works would be a student's real certificate.
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
 * Renders the blank with stand-in values so the detected layout can be seen.
 * Pass ?studentId= to preview a real student's details instead.
 */
export async function previewCertificateTemplate(request, response) {
  const template = await findCertificateTemplate(request.query.courseId);

  if (!template) {
    return response.status(404).json({ message: "No certificate template is stored." });
  }

  const templateBuffer = await readGridFsFile(template.bucket, template.fileId);
  const layout = await getCertificateLayout(template, templateBuffer);

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

  const { bytes } = await fillCertificate({ templateBuffer, layout, values });

  response.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": 'inline; filename="certificate-preview.pdf"',
    "Cache-Control": "no-store"
  });

  return response.send(bytes);
}

/** The detected field map, for checking a template without opening a PDF. */
export async function getCertificateTemplateLayout(request, response) {
  const template = await findCertificateTemplate(request.query.courseId);

  if (!template) {
    return response.status(404).json({ message: "No certificate template is stored." });
  }

  const layout = await getCertificateLayout(template);

  return response.json({
    template: { id: String(template._id), title: template.title, filename: template.filename },
    layout
  });
}
