import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { checkEmail, MAX_LENGTH } from "../../lib/fieldRules";
import AuthScreen from "../components/AuthScreen";
import { passwordError } from "../passwordRules";
import { getStoredSession, requestPasswordOtp, resetPasswordWithOtp } from "../services/authService";

// The server sends at most one OTP a minute, so Resend waits that long.
const RESEND_SECONDS = 60;

// One box per digit of the OTP.
const OTP_SLOTS = [0, 1, 2, 3, 4, 5];

const serverMessage = (requestError, fallback) => requestError.response?.data?.message || fallback;

// The digits show in the boxes, not in the input, so the caret has to stay at
// the end — put anywhere else it would be typing into a box the reader cannot
// see it in. The check stops this from setting off its own select event.
const caretToEnd = (event) => {
  const input = event.target;
  const end = input.value.length;
  if (input.selectionStart !== end || input.selectionEnd !== end) {
    input.setSelectionRange(end, end);
  }
};

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // "email" asks for the OTP; "reset" takes the OTP and the new password.
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState(location.state?.email ?? "");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  // Turns the boxes red. Separate from `error`, which also carries password
  // and email trouble that has nothing to do with the code.
  const [badOtp, setBadOtp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Counts the Resend button down, one second at a time.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendOtp = async () => {
    setError("");
    setIsSubmitting(true);
    try {
      await requestPasswordOtp(email.trim());
      setStep("reset");
      setResendIn(RESEND_SECONDS);
    } catch (requestError) {
      setError(serverMessage(requestError, "The OTP could not be sent. Try again later."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSubmit = (event) => {
    event.preventDefault();
    const problem = checkEmail(email);
    if (problem) {
      setError(problem);
      return;
    }
    sendOtp();
  };

  const handleResetSubmit = async (event) => {
    event.preventDefault();
    const shortOtp = !/^\d{6}$/.test(otp);
    const problem = shortOtp
      ? "Enter the 6-digit OTP from the email."
      : passwordError(newPassword, confirmPassword);
    if (problem) {
      setError(problem);
      setBadOtp(shortOtp);
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      await resetPasswordWithOtp({ email: email.trim(), otp, newPassword });
      navigate("/login", {
        replace: true,
        state: { message: "Password changed. You can now sign in." }
      });
    } catch (requestError) {
      setError(serverMessage(requestError, "The password could not be changed. Try again later."));
      // Every refusal the server has for this form is a 400 about the code —
      // wrong, expired, or guessed at too often. 503 is the mail or database
      // being down, which is nothing the reader can fix in these boxes.
      setBadOtp(requestError.response?.status === 400);
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeEmail = () => {
    setStep("email");
    setOtp("");
    setError("");
    setBadOtp(false);
  };

  // Somebody already signed in has no password to recover here.
  const session = getStoredSession();
  if (session?.user) {
    return <Navigate to={session.redirectTo || `/${session.user.role}`} replace />;
  }

  return (
    <AuthScreen>
      <p className="entity-label">Student account</p>
      <h1>Forgot password</h1>

      {step === "email" ? (
        // noValidate: show our own email message instead of the browser's pop-up.
        <form className="auth-form" onSubmit={handleEmailSubmit} noValidate>
          <label className="auth-field">
            <span>Email</span>
            <input
              value={email}
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={MAX_LENGTH.email}
              onChange={(event) => {
                setError("");
                setEmail(event.target.value);
              }}
            />
          </label>

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="primary-action" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending OTP..." : "Send OTP"}
          </button>

          <div className="auth-links">
            <Link className="auth-link" to="/login">
              Back to sign in
            </Link>
          </div>
        </form>
      ) : (
        <form className="auth-form" onSubmit={handleResetSubmit}>
          <p className="auth-note" role="status">
            If <strong>{email.trim()}</strong> is an active student account, an OTP was sent to
            it. It expires in 10 minutes.
          </p>

          {/* The label is tied to the input by id rather than wrapped around
              it, because the boxes carry the digits as text and a label that
              held them would read as "OTP 1 2 3 4 5 6". */}
          <span className="auth-field">
            <label htmlFor="forgot-otp">OTP</label>
            <span className="auth-code__box">
              <input
                id="forgot-otp"
                className="auth-code__input"
                value={otp}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_SLOTS.length}
                aria-invalid={badOtp || undefined}
                onFocus={caretToEnd}
                onSelect={caretToEnd}
                onChange={(event) => {
                  setError("");
                  setBadOtp(false);
                  setOtp(event.target.value.replace(/\D/g, ""));
                }}
              />
              <span className="auth-code__slots" aria-hidden="true">
                {OTP_SLOTS.map((slot) => (
                  <span
                    key={slot}
                    className="auth-code__slot"
                    data-active={slot === Math.min(otp.length, OTP_SLOTS.length - 1) || undefined}
                  >
                    {otp[slot] ?? ""}
                  </span>
                ))}
              </span>
            </span>
          </span>

          <label className="auth-field">
            <span>New password</span>
            <input
              value={newPassword}
              type="password"
              autoComplete="new-password"
              onChange={(event) => {
                setError("");
                setNewPassword(event.target.value);
              }}
            />
          </label>

          <label className="auth-field">
            <span>Confirm new password</span>
            <input
              value={confirmPassword}
              type="password"
              autoComplete="new-password"
              onChange={(event) => {
                setError("");
                setConfirmPassword(event.target.value);
              }}
            />
          </label>

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="primary-action" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Changing password..." : "Change password"}
          </button>

          <div className="auth-links">
            <button
              type="button"
              className="auth-link"
              onClick={sendOtp}
              disabled={isSubmitting || resendIn > 0}
            >
              {resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend OTP"}
            </button>
            <button type="button" className="auth-link" onClick={changeEmail}>
              Change email
            </button>
          </div>
        </form>
      )}
    </AuthScreen>
  );
}

export default ForgotPasswordPage;
