import mongoose from "mongoose";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { LAYOUT_VERSION, analyzeCertificateTemplate } from "./certificates.ocr.js";

/**
 * Issuing a certificate: take the blank template, stamp the student's details
 * into it, and keep the result.
 *
 * The template is a design export with no text layer (see certificates.ocr.js
 * for how its blanks are located). That analysis is the expensive half, so it
 * is cached per template file and only rerun when the template changes or the
 * detection logic is versioned up.
 *
 * A filled certificate is stored, not generated on demand, because it is a
 * record: it states what was true when the assessor released it. Re-running
 * the fill later against a renamed course or a corrected spelling would
 * quietly rewrite history, so the bytes are frozen at issue time.
 */
const TEMPLATES_COLLECTION = "Certificate";
const LAYOUTS_COLLECTION = "CertificateLayout";
const ISSUED_COLLECTION = "IssuedCertificate";
const ISSUED_BUCKET = "IssuedCertificate";
const COURSES_COLLECTION = "Course";

const collection = (name) => mongoose.connection.collection(name);

function gridFsBucket(bucketName) {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
}

export function readGridFsFile(bucketName, fileId) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    gridFsBucket(bucketName)
      .openDownloadStream(fileId)
      .on("data", (chunk) => chunks.push(chunk))
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function storeGridFsFile(bucketName, filename, buffer, metadata) {
  return new Promise((resolve, reject) => {
    const upload = gridFsBucket(bucketName).openUploadStream(filename, {
      contentType: "application/pdf",
      metadata
    });

    upload.on("error", reject);
    upload.on("finish", () => resolve(upload.id));
    upload.end(buffer);
  });
}

/**
 * The blank to stamp.
 *
 * A template may name the course it belongs to; the course-specific one wins,
 * and otherwise the newest upload stands in as the house template. The
 * `studentId` on the seeded document is ignored on purpose — it records who
 * the sample was uploaded for, not who the blank may be issued to.
 */
export async function findCertificateTemplate(courseId) {
  if (!(await collectionExists(TEMPLATES_COLLECTION))) return null;

  const templates = await collection(TEMPLATES_COLLECTION).find({}).toArray();
  if (templates.length === 0) return null;

  const forCourse = courseId
    ? templates.find((template) =>
        idCandidates(courseId).some(
          (candidate) => String(template.courseId ?? "") === String(candidate)
        )
      )
    : null;

  if (forCourse) return forCourse;

  return templates.sort(
    (a, b) => new Date(b.uploadDate ?? 0) - new Date(a.uploadDate ?? 0)
  )[0];
}

/** The template's field map — analysed once, then read from cache. */
export async function getCertificateLayout(template, templateBuffer) {
  const key = { templateFileId: String(template.fileId), version: LAYOUT_VERSION };

  if (await collectionExists(LAYOUTS_COLLECTION)) {
    const cached = await collection(LAYOUTS_COLLECTION).findOne(key);
    if (cached?.layout) return cached.layout;
  }

  const buffer = templateBuffer ?? (await readGridFsFile(template.bucket, template.fileId));
  const layout = await analyzeCertificateTemplate(buffer);

  await collection(LAYOUTS_COLLECTION).updateOne(
    key,
    { $set: { ...key, layout, analyzedAt: new Date() } },
    { upsert: true }
  );

  return layout;
}

function toRgb(color) {
  return rgb(color?.r ?? 0.15, color?.g ?? 0.15, color?.b ?? 0.16);
}

/**
 * Stamps values onto the template.
 *
 * Each field arrives as a midpoint plus the unit vector the text runs along,
 * so centring is the same arithmetic whichever way the page is turned — this
 * template's artwork is rotated a quarter turn inside a portrait page, and
 * nothing here needs to special-case that.
 *
 * Long values shrink to fit their blank rather than run past it: a name that
 * overflows the ruled line looks like a bug, a slightly smaller name does not.
 */
export async function fillCertificate({ templateBuffer, layout, values }) {
  const pdf = await PDFDocument.load(templateBuffer);
  const page = pdf.getPages()[0];
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const applied = [];

  for (const field of layout.fields) {
    const value = String(values?.[field.id] ?? "").trim();
    if (!value) continue;

    let size = field.fontSize;
    let width = font.widthOfTextAtSize(value, size);

    if (field.maxWidth && width > field.maxWidth) {
      size = Math.max(6, (size * field.maxWidth) / width);
      width = font.widthOfTextAtSize(value, size);
    }

    const advance = field.advance ?? { x: 1, y: 0 };
    const angle = (Math.atan2(advance.y, advance.x) * 180) / Math.PI;
    // Centred values back up by half their width; left-aligned ones start
    // where the anchor says, which is how the course code lands beside its
    // caption instead of straddling it.
    const lead = field.align === "left" ? 0 : width / 2;

    page.drawText(value, {
      x: field.anchor.x - advance.x * lead,
      y: field.anchor.y - advance.y * lead,
      size,
      font,
      color: toRgb(field.color),
      rotate: degrees(angle)
    });

    applied.push({ id: field.id, value, fontSize: Number(size.toFixed(2)) });
  }

  return { bytes: Buffer.from(await pdf.save()), applied };
}

function studentName(student) {
  const full = [student?.first_name, student?.last_name].filter(Boolean).join(" ").trim();
  return full || student?.full_name || student?.name || student?.email || "";
}

function courseCode(course) {
  return String(course?.courseCode ?? course?.code ?? "").trim();
}

function courseTitle(course) {
  return course?.courseName ?? course?.title ?? course?.name ?? "";
}

function formatIssueDate(date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

/**
 * The values a certificate carries, drawn from the records rather than typed:
 * who the student is, what they completed, when it was released and who
 * released it.
 */
export function certificateValues({ student, course, assessor, issuedAt }) {
  return {
    studentName: studentName(student),
    // The ruled line carries what was completed, so it takes the full course
    // name; the code is an annotation beside the caption. A course missing one
    // of the two falls back to the other rather than leaving the line blank.
    courseTitle: courseTitle(course) || courseCode(course),
    courseCode: courseTitle(course) ? courseCode(course) : "",
    dateIssued: formatIssueDate(issuedAt ?? new Date()),
    signature: assessor?.name ?? ""
  };
}

/**
 * Fills and stores one student's certificate.
 *
 * Idempotent per submission: re-issuing replaces the stored file instead of
 * piling up copies, which matters because the assessor console lets a release
 * be retried after a failure.
 */
export async function issueCertificate({
  student,
  course,
  assessor,
  submissionId,
  credentialName,
  issuedAt = new Date()
}) {
  const template = await findCertificateTemplate(course?._id);
  if (!template) return null;

  const templateBuffer = await readGridFsFile(template.bucket, template.fileId);
  const layout = await getCertificateLayout(template, templateBuffer);
  const values = certificateValues({ student, course, assessor, issuedAt });
  const { bytes, applied } = await fillCertificate({ templateBuffer, layout, values });

  const filename = `Certificate_${courseCode(course) || "Course"}_${
    student?.student_id ?? String(student?._id ?? "student")
  }.pdf`;

  const match = {
    studentId: String(student?._id ?? ""),
    submissionId: submissionId ? String(submissionId) : null,
    courseId: String(course?._id ?? "")
  };

  const previous = await collection(ISSUED_COLLECTION).findOne(match);
  if (previous?.fileId) {
    try {
      await gridFsBucket(ISSUED_BUCKET).delete(previous.fileId);
    } catch {
      // Already gone — the replacement below is what matters.
    }
  }

  const fileId = await storeGridFsFile(ISSUED_BUCKET, filename, bytes, {
    studentId: match.studentId,
    courseId: match.courseId
  });

  const document = {
    ...match,
    templateId: String(template._id),
    title: credentialName ?? template.title ?? "Certificate of Completion",
    filename,
    contentType: "application/pdf",
    fileSize: bytes.length,
    fileId,
    bucket: ISSUED_BUCKET,
    fields: applied,
    issuedBy: assessor?.name ?? null,
    issuedAt
  };

  // Returned with its stored _id: that is the id the download route takes, and
  // it is not the GridFS file id.
  const stored = await collection(ISSUED_COLLECTION).findOneAndUpdate(
    match,
    { $set: document },
    { upsert: true, returnDocument: "after" }
  );

  return stored?._id ? stored : (stored?.value ?? { ...document, _id: null });
}

/** Every certificate a student holds, newest first. */
export async function listIssuedCertificates(studentId) {
  if (!(await collectionExists(ISSUED_COLLECTION))) return [];

  const rows = await collection(ISSUED_COLLECTION)
    .find({ studentId: { $in: idCandidates(studentId).map(String) } })
    .toArray();

  const courses = await collection(COURSES_COLLECTION)
    .find({ _id: { $in: rows.flatMap((row) => idCandidates(row.courseId)) } })
    .toArray();
  const courseById = new Map(courses.map((course) => [String(course._id), course]));

  return rows
    .map((row) => {
      const course = courseById.get(String(row.courseId));
      return {
        id: String(row._id),
        // The release this sheet was stamped from — how the achievements
        // endpoint pairs a certificate with its credential.
        submissionId: row.submissionId ?? null,
        // Kept beside the code so a caller reading one course's record can
        // pick out the sheets that belong to it.
        courseId: row.courseId ? String(row.courseId) : null,
        title: row.title,
        filename: row.filename,
        courseCode: courseCode(course),
        courseTitle: courseTitle(course),
        issuedBy: row.issuedBy ?? null,
        issuedAt: row.issuedAt ?? null,
        fileSize: row.fileSize ?? null
      };
    })
    .sort((a, b) => new Date(b.issuedAt ?? 0) - new Date(a.issuedAt ?? 0));
}

export async function findIssuedCertificate(certificateId) {
  if (!(await collectionExists(ISSUED_COLLECTION))) return null;
  return collection(ISSUED_COLLECTION).findOne({ _id: { $in: idCandidates(certificateId) } });
}
