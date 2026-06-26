import mongoose from "mongoose";

/**
 * "Abang" — a lookout endpoint that waits for the courses data.
 *
 * The courses collection isn't set up yet, so instead of erroring this responds
 * gracefully with an empty list (and `pending: true`) until the collection
 * exists. Once you create a "Course" collection with documents linked to a
 * student, this immediately starts serving real data — no route changes needed.
 *
 * Expected course document shape (flexible — common field names are accepted):
 *   { studentId, code, title, imageUrl }
 */
const COURSES_COLLECTION = "Course";

function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

async function coursesCollectionExists() {
  if (!isDatabaseReady()) return false;
  const collections = await mongoose.connection.db
    .listCollections({ name: COURSES_COLLECTION }, { nameOnly: true })
    .toArray();
  return collections.length > 0;
}

function toPublicCourse(course) {
  return {
    id: course._id,
    code: course.code ?? course.course_code ?? "",
    title: course.title ?? course.name ?? course.course_name ?? "",
    imageUrl: course.imageUrl ?? course.image_url ?? null
  };
}

export async function getStudentCourses(request, response) {
  const studentId = request.params.id;

  // Still waiting on the database / courses collection — respond with nothing
  // yet rather than failing.
  if (!(await coursesCollectionExists())) {
    return response.json({ courses: [], pending: true });
  }

  const courses = await mongoose.connection
    .collection(COURSES_COLLECTION)
    .find({ $or: [{ studentId }, { student_id: studentId }, { studentIds: studentId }] })
    .toArray();

  return response.json({ courses: courses.map(toPublicCourse) });
}
