import isEmail from "validator/lib/isEmail.js";

/*
 * The rules for what the admin types into the create and edit forms.
 * Each check returns an error message, or null when the value is fine.
 * client/src/lib/fieldRules.js has the same rules, so the form can warn first.
 */

// Letters (including ñ and accents), spaces, hyphens, apostrophes and periods:
// "Maria Clara", "De Guzman", "O'Neil", "Jr.".
const NAME_PATTERN = /^[\p{L}][\p{L} .'-]*$/u;

export function checkName(value, label = "Name") {
  const name = String(value ?? "").trim();
  if (!name) return `${label} is required.`;
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
  // validator requires a real domain ending, so "s@g.c" is refused.
  if (!isEmail(email)) return "Enter a valid email address, like juan@student.edu.ph.";
  return null;
}

// Letters, numbers, spaces and hyphens: "CC2", "ITTSM ELECT 5", "IT-101".
export function checkCourseCode(value) {
  const code = String(value ?? "").trim();
  if (!code) return "A course code is required.";
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
  if (!/^[\p{L}0-9][\p{L}0-9 .,:;&()'/-]*$/u.test(title)) {
    return "Course title can only have letters, numbers, spaces and . , : ; & ( ) ' / -";
  }
  if ((title.match(/\p{L}/gu) ?? []).length < 3) return "Course title must be at least 3 letters.";
  return null;
}
