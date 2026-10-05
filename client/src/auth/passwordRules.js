import { MAX_LENGTH } from "../lib/fieldRules";

const MIN_PASSWORD_LENGTH = 8;

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

/**
 * The server's password rule, checked first so the form can say what is wrong.
 * Returns a message, or null when the password is fine.
 */
export function passwordError(password, confirmPassword) {
  if (!password) return "Password is required.";
  if (password.length < MIN_PASSWORD_LENGTH) return "Password must be at least 8 characters.";
  if (byteLength(password) > MAX_LENGTH.password) return "Password can be at most 72 bytes.";
  if (password !== confirmPassword) return "Passwords must match.";
  return null;
}
