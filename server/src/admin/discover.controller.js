import mongoose from "mongoose";
import { idCandidates } from "../lib/mongo.js";
import { courseStatus } from "../lib/courseAccess.js";
import { toIsoDay } from "../lib/courseDates.js";
import { classMode } from "../lib/classMode.js";
import { accountStatus } from "../lib/suspension.js";
import { personName } from "./classes.controller.js";
import {
  ENROLLMENT_MODES, enrollmentOf, discoverRefusal, addStudentToClass,
  removeRequest, dropRequests
} from "./classEnrollment.js";

const collection = (name) => mongoose.connection.collection(name);
const find = (name, id) => collection(name).findOne({ _id: { $in: idCandidates(id) } });
const notReady = (res) => res.status(503).json({ message: "The database is not connected. Try again shortly." });

// Preload the related records once for the list and for refreshed rows.
async function rowsFor(classes) {
  const [courses, assessors, students] = await Promise.all([
    collection("Course").find({ _id: { $in: classes.flatMap((cls) => idCandidates(cls.courseId)) } }).toArray(),
    collection("Assessor").find({ _id: { $in: classes.flatMap((cls) => (cls.assessorIds ?? []).flatMap(idCandidates)) } }).toArray(),
    collection("Student").find({ _id: { $in: classes.flatMap((cls) => (cls.requestedStudentIds ?? []).flatMap(idCandidates)) } }).toArray()
  ]);
  const map = (docs) => new Map(docs.map((doc) => [String(doc._id), doc]));
  const courseById = map(courses), assessorById = map(assessors), studentById = map(students);
  return classes.map((cls) => {
    const course = courseById.get(String(cls.courseId));
    const assessor = assessorById.get(String(cls.assessorIds?.[0]));
    return {
      id: String(cls._id), name: cls.name ?? "", mode: classMode(cls),
      course: course ? {
        id: String(course._id), code: course.courseCode ?? course.code ?? "",
        title: course.courseName ?? course.title ?? course.name ?? "", status: courseStatus(course),
        startsOn: toIsoDay(course.startsOn), endsOn: toIsoDay(course.endsOn)
      } : null,
      assessor: assessor ? personName(assessor) : null,
      schedule: {
        days: String(cls.schedule?.days ?? "").trim(),
        time: String(cls.schedule?.time ?? "").trim(),
        room: String(cls.schedule?.room ?? "").trim()
      },
      active: cls.active !== false, posted: cls.posted === true, enrollment: enrollmentOf(cls),
      studentCount: (cls.studentIds ?? []).length,
      refusal: discoverRefusal(cls, course),
      requests: (cls.requestedStudentIds ?? []).map((id) => studentById.get(String(id))).filter(Boolean).map((student) => ({
        studentId: String(student._id), name: personName(student), studentNumber: student.student_id ?? null
      }))
    };
  });
}

async function respondWithClass(res, id) {
  const cls = await find("Class", id);
  return res.json({ class: (await rowsFor([cls]))[0] });
}

export async function setClassDiscover(req, res) {
  if (mongoose.connection.readyState !== 1) return notReady(res);
  const cls = await find("Class", req.params.id);
  if (!cls || cls.archived === true) return res.status(404).json({ message: "Class not found." });
  const body = req.body ?? {};
  if ("posted" in body && typeof body.posted !== "boolean") {
    return res.status(400).json({ message: "Posted must be true or false." });
  }
  if ("enrollment" in body && !ENROLLMENT_MODES.includes(body.enrollment)) {
    return res.status(400).json({ message: "Choose Open or Needs approval." });
  }
  if (body.posted === true) {
    const refusal = discoverRefusal(cls, await find("Course", cls.courseId));
    if (refusal) return res.status(400).json({ message: refusal });
  }
  const updates = { updatedAt: new Date() };
  if ("posted" in body) updates.posted = body.posted;
  if ("enrollment" in body) updates.enrollment = body.enrollment;
  else if (body.posted === true) updates.enrollment = enrollmentOf(cls);
  if (body.posted === false) updates.requestedStudentIds = [];
  await collection("Class").updateOne({ _id: cls._id, archived: { $ne: true } }, { $set: updates });
  return respondWithClass(res, cls._id);
}

async function requestedClass(req, res) {
  const cls = await find("Class", req.params.id);
  if (!cls || cls.archived === true || !(cls.requestedStudentIds ?? []).some((id) => String(id) === req.params.studentId)) {
    res.status(404).json({ message: "Request not found." });
    return null;
  }
  return cls;
}

export async function acceptEnrollRequest(req, res) {
  if (mongoose.connection.readyState !== 1) return notReady(res);
  const cls = await requestedClass(req, res);
  if (!cls) return;
  const refusal = discoverRefusal(cls, await find("Course", cls.courseId));
  if (!cls.posted || refusal) return res.status(409).json({ message: refusal || "This class isn't posted." });
  const student = await find("Student", req.params.studentId);
  if (!student || accountStatus(student) !== "active") {
    return res.status(409).json({ message: "This student's account isn't active." });
  }
  const result = await addStudentToClass(cls, student, { fromRequest: true });
  if (result) {
    if (result.startsWith("Already in ")) await dropRequests(cls.courseId, [student._id]);
    return res.status(409).json({ message: result });
  }
  return respondWithClass(res, cls._id);
}

export async function declineEnrollRequest(req, res) {
  if (mongoose.connection.readyState !== 1) return notReady(res);
  const cls = await requestedClass(req, res);
  if (!cls) return;
  await removeRequest(cls, req.params.studentId);
  return respondWithClass(res, cls._id);
}
