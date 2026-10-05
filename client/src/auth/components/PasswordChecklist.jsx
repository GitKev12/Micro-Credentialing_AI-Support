import { passwordChecks } from "../passwordRules";

/**
 * Ticks each password rule off while the password is typed. Nothing shows
 * until typing starts, and the list folds into one line once every rule is met.
 */
export default function PasswordChecklist({ id, password }) {
  if (!password) return null;

  const checks = passwordChecks(password);
  if (checks.every((check) => check.ok)) {
    return (
      <p id={id} className="auth-check-line" data-ok="true">
        <span aria-hidden="true">✓</span> Strong password
      </p>
    );
  }

  return (
    <ul id={id} className="auth-checklist" aria-label="Password requirements">
      {checks.map(({ label, ok }) => (
        <li key={label} data-met={ok}>
          <span aria-hidden="true">{ok ? "✓" : "○"}</span>
          <span className="auth-sr-only">{ok ? "Met: " : "Not met: "}</span>
          {label}
        </li>
      ))}
    </ul>
  );
}

/** Says, as the second box is typed in, whether the two passwords match. */
export function PasswordMatch({ id, password, confirmPassword }) {
  if (!confirmPassword) return null;
  const same = password === confirmPassword;
  return (
    <p id={id} className="auth-check-line" data-ok={same} aria-live="polite">
      <span aria-hidden="true">{same ? "✓" : "✕"}</span> {same ? "Passwords match" : "Passwords don't match"}
    </p>
  );
}
