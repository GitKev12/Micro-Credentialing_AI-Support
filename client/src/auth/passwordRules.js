import { MAX_LENGTH } from "../lib/fieldRules";
import isStrongPassword from "validator/lib/isStrongPassword";

const hasSymbol = (password) => /[-#!$@£%^&*()_+|~=`{}\[\]:";'<>?,.\/\\]/.test(password);

export const WEAK_PASSWORD =
  "The password needs at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol.";

/**
 * The server's password rule, checked first so the form can say what is wrong.
 * Returns a message, or null when the password is fine.
 */
export function passwordError(password, confirmPassword) {
  if (!password) return "Password is required.";
  if (new TextEncoder().encode(password).length > MAX_LENGTH.password) return "Password can be at most 72 bytes.";
  if (!isStrongPassword(password) || !hasSymbol(password)) return WEAK_PASSWORD;
  if (password !== confirmPassword) return "Passwords must match.";
  return null;
}

/**
 * Live feedback as the user types: a list of [{ label, ok }] showing which rules the password meets.
 */
export function passwordChecks(password) {
  const checks = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "An uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "A lowercase letter", ok: /[a-z]/.test(password) },
    { label: "A number", ok: /[0-9]/.test(password) },
    { label: "A symbol", ok: hasSymbol(password) }
  ];
  // Only shown once it is broken: nobody needs a tick for "not too long".
  if (new TextEncoder().encode(password).length > MAX_LENGTH.password) {
    checks.push({ label: "No longer than 72 bytes (emoji and accented letters count extra)", ok: false });
  }
  return checks;
}
