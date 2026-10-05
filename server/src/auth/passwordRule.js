import isStrongPassword from "validator/lib/isStrongPassword.js";

export const WEAK_PASSWORD =
  "The password needs at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol.";

/**
 * The rule for a password a student sets (signup and forgot password).
 * Returns a message, or null when the password is fine.
 * Not trimmed, and bcrypt ignores anything past 72 bytes, so that is the cap.
 */
export function passwordProblem(password) {
  if (Buffer.byteLength(password, "utf8") > 72) return "The password can be at most 72 UTF-8 bytes.";
  // validator's defaults: 8 characters, 1 lowercase, 1 uppercase, 1 number, 1 symbol.
  const hasSymbol = /[-#!$@£%^&*()_+|~=`{}\[\]:";'<>?,.\/\\]/.test(password);
  if (!isStrongPassword(password) || !hasSymbol) return WEAK_PASSWORD;
  return null;
}
