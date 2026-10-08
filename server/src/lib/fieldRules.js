import isEmail from "validator/lib/isEmail.js";

/*
 * The rules for what the admin types into the create and edit forms.
 * Each check returns an error message, or null when the value is fine.
 * client/src/lib/fieldRules.js has the same rules, so the form can warn first.
 */

// The longest each field may be. Real values are far shorter; these stop a
// pasted wall of text from being saved.
export const MAX_LENGTH = {
  name: 60,
  email: 254,
  courseCode: 20,
  courseTitle: 120,
  courseDescription: 2000,
  courseCategory: 40,
  lessonTitle: 150,
  className: 50,
  schedule: 50,
  idNumber: 30,
  password: 72
};

/** "<label> can be at most N characters.", or null when it fits. */
export function checkLength(value, label, max) {
  return String(value ?? "").trim().length > max ? `${label} can be at most ${max} characters.` : null;
}

// Letters (including ñ and accents), spaces, hyphens, apostrophes and periods:
// "Maria Clara", "De Guzman", "O'Neil", "Jr.".
const NAME_PATTERN = /^[\p{L}][\p{L} .'-]*$/u;

export function checkName(value, label = "Name") {
  const name = String(value ?? "").trim();
  if (!name) return `${label} is required.`;
  if (name.length > MAX_LENGTH.name) return `${label} can be at most ${MAX_LENGTH.name} characters.`;
  if (!NAME_PATTERN.test(name)) {
    return `${label} can only have letters, spaces, hyphens (-), apostrophes (') and periods.`;
  }
  // At least two letters, so "a" or "a." isn't accepted as a name.
  if ((name.match(/\p{L}/gu) ?? []).length < 2) return `${label} must be at least 2 letters.`;
  return null;
}

export function checkEmail(value) {
  const email = String(value ?? "").trim();
  if (!email) return "An email address is required.";
  if (email.length > MAX_LENGTH.email) return `Email can be at most ${MAX_LENGTH.email} characters.`;
  // validator requires a real domain ending, so "s@g.c" is refused.
  if (!isEmail(email)) return "Enter a valid email address, like juan@student.edu.ph.";
  return null;
}

// Letters, numbers, spaces and hyphens: "CC2", "ITTSM ELECT 5", "IT-101".
export function checkCourseCode(value) {
  const code = String(value ?? "").trim();
  if (!code) return "A course code is required.";
  if (code.length > MAX_LENGTH.courseCode) return `Course code can be at most ${MAX_LENGTH.courseCode} characters.`;
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(code)) {
    return "Course code can only have letters, numbers, spaces and hyphens.";
  }
  if (code.length < 2) return "Course code must be at least 2 characters.";
  return null;
}

// A title also allows the punctuation real titles use: "Object-Oriented
// Programming", "IT Elective 5: Tech Support (Part 1)", "Web & Mobile".
export function checkCourseTitle(value) {
  const title = String(value ?? "").trim();
  if (!title) return "A course title is required.";
  if (title.length > MAX_LENGTH.courseTitle) return `Course title can be at most ${MAX_LENGTH.courseTitle} characters.`;
  if (!/^[\p{L}0-9][\p{L}0-9 .,:;&()'/-]*$/u.test(title)) {
    return "Course title can only have letters, numbers, spaces and . , : ; & ( ) ' / -";
  }
  if ((title.match(/\p{L}/gu) ?? []).length < 3) return "Course title must be at least 3 letters.";
  return null;
}

// The most hours a course can be given. A long one runs a few hundred; this
// only stops a typo like 30000 from being saved.
export const MAX_COURSE_HOURS = 1000;

// How long the course takes, in hours — the "30 Hours" a catalogue entry
// carries. Optional: blank means nobody has set one yet.
export function checkCourseHours(value) {
  const hours = String(value ?? "").trim();
  if (!hours) return null;
  if (!/^\d+$/.test(hours)) return "Course hours must be a whole number.";
  const number = Number(hours);
  if (number < 1) return "Course hours must be at least 1.";
  if (number > MAX_COURSE_HOURS) return `Course hours can be at most ${MAX_COURSE_HOURS}.`;
  return null;
}
