import { useEffect, useRef, useState } from "react";
import { checkEmail, MAX_LENGTH } from "../../lib/fieldRules";
import { sendSignupCode, verifySignupCode } from "../services/authService";
import CodeBoxes from "./CodeBoxes";

const TEN_MINUTES = 10 * 60 * 1000;
const expiryTime = (value, fallback) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Remembers the email check: code sent, the 60-second wait, and Verified.
 * The page calls this, not the field, so switching to Sign in and back
 * does not wipe it (the signup form, and the field with it, is removed then).
 */
export function useEmailVerification({ email, onEmailChange, onVerification, disabled }) {
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [badCode, setBadCode] = useState(false);
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  // Every edit/resend advances the request ID, including edits from A -> B -> A.
  const request = useRef(0);
  const alive = useRef(true);
  const notify = useRef(onVerification);
  notify.current = onVerification;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; request.current += 1; };
  }, []);

  useEffect(() => {
    if (!resendAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    if (!expiresAt) return undefined;
    const timer = setTimeout(() => {
      request.current += 1;
      setStatus("idle");
      setCode("");
      setExpiresAt(0);
      setBadCode(true);
      setError("The code expired. Request a new code.");
      notify.current("", false, 0);
    }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);

  const current = (id) => alive.current && id === request.current;
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const send = async () => {
    if (disabled || status === "sending" || Date.now() < resendAt) return;
    const problem = checkEmail(email);
    if (problem) { setError(problem); return; }
    const id = ++request.current;
    // Resending invalidates an in-flight verification before the send finishes.
    setCode("");
    setStatus("sending");
    setError("");
    setBadCode(false);
    setExpiresAt(0);
    notify.current("", false, 0);
    try {
      const result = await sendSignupCode(email.trim());
      if (!current(id)) return;
      const time = Date.now();
      setSent(true);
      setNow(time);
      setResendAt(time + (result?.resendAfter ?? 60) * 1000);
      setExpiresAt(expiryTime(result?.expiresAt, time + TEN_MINUTES));
      setStatus("idle");
    } catch (failure) {
      if (!current(id)) return;
      const retry = Number(failure.response?.data?.retryAfter ?? failure.response?.headers?.["retry-after"]);
      if (retry > 0) {
        setNow(Date.now());
        setResendAt(Date.now() + retry * 1000);
      }
      setStatus("idle");
      setError(failure.response?.data?.message || "The code could not be sent. Try again later.");
    }
  };

  const changeCode = async (value) => {
    if (value === code) return;
    const id = ++request.current;
    setCode(value);
    setError("");
    setBadCode(false);
    setStatus("idle");
    notify.current(value, false, 0);
    if (value.length !== 6) return;
    if (Date.now() >= expiresAt) {
      setBadCode(true);
      setError("The code expired. Request a new code.");
      return;
    }
    setStatus("verifying");
    try {
      const result = await verifySignupCode({ email: email.trim(), code: value });
      if (!current(id)) return;
      const expiry = expiryTime(result?.expiresAt, expiresAt);
      if (expiry <= Date.now()) {
        setStatus("idle");
        setBadCode(true);
        setError("The code expired. Request a new code.");
        return;
      }
      setExpiresAt(expiry);
      setStatus("verified");
      notify.current(value, true, expiry);
    } catch (failure) {
      if (!current(id)) return;
      setStatus("idle");
      setBadCode(true);
      setError(failure.response?.data?.message || "The code could not be verified. Check it and try again.");
    }
  };

  const changeEmail = (value) => {
    request.current += 1;
    setCode("");
    setSent(false);
    setStatus("idle");
    setError("");
    setBadCode(false);
    setExpiresAt(0);
    // resendAt is kept: the 60-second wait holds even for a new email.
    onEmailChange(value);
  };

  return { email, disabled, code, sent, status, error, badCode, resendIn, send, changeCode, changeEmail };
}

/** Draws the email box, its Verify button and the code boxes from useEmailVerification. */
export default function EmailVerifyField({ verification }) {
  const { email, disabled, code, sent, status, error, badCode, resendIn, send, changeCode, changeEmail } =
    verification;
  // "Resend" for the same email, "Verify" once the email has been changed.
  // The countdown says just "Wait 57s" so the email beside it is not cut off.
  const buttonWord = sent ? "Resend" : "Verify";

  return (
    <div className="auth-email-verify">
      <div className="auth-field">
        <label htmlFor="signup-email">Email</label>
        <span className="auth-input-wrap auth-input-wrap--email">
          <input id="signup-email" value={email} type="email" autoComplete="email"
            autoCapitalize="none" spellCheck={false} maxLength={MAX_LENGTH.email}
            disabled={disabled} onChange={(event) => changeEmail(event.target.value)} />
          {status === "verified" ? (
            <span className="auth-input-action auth-verified" role="status">Verified</span>
          ) : (
            <button type="button" className="auth-input-action auth-verify-button" onClick={send}
              disabled={disabled || status === "sending" || resendIn > 0}>
              {status === "sending" ? "Sending..." : resendIn > 0 ? `Wait ${resendIn}s` : buttonWord}
            </button>
          )}
        </span>
      </div>
      {sent && status !== "verified" ? (
        <CodeBoxes id="signup-code" label="Verification code" value={code} onChange={changeCode}
          invalid={badCode} disabled={disabled || status === "sending"}
          aria-describedby={error ? "signup-code-error" : undefined} />
      ) : null}
      {status === "verifying" ? <p className="auth-verification-status" role="status">Verifying...</p> : null}
      {error ? <p id="signup-code-error" className="auth-error" role="alert">{error}</p> : null}
    </div>
  );
}
