import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { checkName, MAX_LENGTH } from "../../lib/fieldRules";
import AuthScreen from "../components/AuthScreen";
import EmailVerifyField, { useEmailVerification } from "../components/EmailVerifyField";
import PasswordChecklist, { PasswordMatch } from "../components/PasswordChecklist";
import PasswordInput from "../components/PasswordInput";
import { passwordError } from "../passwordRules";
import { getStoredSession, login, saveAuthSession, signupStudent } from "../services/authService";

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toggleRef = useRef(null);

  const isLogin = location.pathname !== "/signup";

  // Login form state
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form state
  const [signupForm, setSignupForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    code: ""
  });
  const [emailVerified, setEmailVerified] = useState(false);

  const [pillStyle, setPillStyle] = useState({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (toggleRef.current) {
      const activeBtn = toggleRef.current.querySelector(
        `.login-toggle__btn.${isLogin ? "is-login" : "is-signup"}`
      );
      if (activeBtn) {
        setPillStyle({
          width: `${activeBtn.offsetWidth}px`,
          left: `${activeBtn.offsetLeft}px`
        });
      }
    }
  }, [isLogin]);

  const switchMode = (targetPath) => {
    if (targetPath === location.pathname) return;
    setError("");
    navigate(targetPath);
  };

  const setSignupField = (field, value) => {
    setError("");
    setSignupForm((current) => ({ ...current, [field]: value }));
  };

  // Kept here, not in the field, so Verified survives a trip to Sign in and back.
  const emailVerification = useEmailVerification({
    email: signupForm.email,
    disabled: isSubmitting,
    onEmailChange: (value) => {
      setSignupField("email", value);
      setSignupField("code", "");
      setEmailVerified(false);
    },
    onVerification: (codeVal, verified) => {
      setSignupField("code", codeVal);
      setEmailVerified(verified);
    }
  });

  const validateSignup = () =>
    checkName(signupForm.firstName, "First name") ||
    checkName(signupForm.lastName, "Last name") ||
    (!emailVerified ? "Verify your email first." : null) ||
    passwordError(signupForm.password, signupForm.confirmPassword);

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const authSession = await login({ identifier, password: loginPassword });
      saveAuthSession(authSession);

      const requestedPath = location.state?.from?.pathname;
      const targetPath =
        requestedPath === authSession.redirectTo ? requestedPath : authSession.redirectTo;

      navigate(targetPath, { replace: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "The login request failed. Check the API server and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignupSubmit = async (event) => {
    event.preventDefault();
    const problem = validateSignup();
    if (problem) {
      setError(problem);
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      await signupStudent({
        firstName: signupForm.firstName,
        lastName: signupForm.lastName,
        email: signupForm.email,
        password: signupForm.password,
        code: signupForm.code
      });
      navigate("/login", {
        replace: true,
        state: { message: "Account created. You can now sign in." }
      });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "The signup request failed. Check the API server and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const session = getStoredSession();
  if (session?.user) {
    return <Navigate to={session.redirectTo || `/${session.user.role}`} replace />;
  }

  const statusMessage = location.state?.message;
  const typedEmail = identifier.includes("@") ? identifier.trim() : "";

  return (
    <AuthScreen>
      <p className="entity-label">{isLogin ? "Login" : "Student signup"}</p>
      <h1>{isLogin ? "Sign in" : "Register"}</h1>

      <div className="login-toggle" ref={toggleRef} role="group" aria-label="Authentication option">
        <div className="login-toggle__pill" style={pillStyle} aria-hidden="true" />
        <button
          type="button"
          className={`login-toggle__btn is-login${isLogin ? " is-active" : ""}`}
          onClick={() => switchMode("/login")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`login-toggle__btn is-signup${!isLogin ? " is-active" : ""}`}
          onClick={() => switchMode("/signup")}
        >
          Sign up
        </button>
      </div>

      {isLogin && statusMessage ? (
        <p className="auth-success" role="status">
          {statusMessage}
        </p>
      ) : null}

      {isLogin ? (
        <form className="auth-form" onSubmit={handleLoginSubmit}>
          <div className="auth-field">
            <label htmlFor="login-identifier">ID Number or Email</label>
            <input
              id="login-identifier"
              value={identifier}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={MAX_LENGTH.email}
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="login-password">Password</label>
            <PasswordInput
              id="login-password"
              value={loginPassword}
              autoComplete="current-password"
              maxLength={MAX_LENGTH.password}
              onChange={(event) => setLoginPassword(event.target.value)}
            />
          </div>

          <div className="auth-forgot">
            <Link
              className="auth-link"
              to="/forgot-password"
              state={typedEmail ? { email: typedEmail } : undefined}
            >
              Forgot password?
            </Link>
          </div>

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="primary-action" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={handleSignupSubmit}>
          <div className="auth-field">
            <label htmlFor="signup-firstname">First name</label>
            <input
              id="signup-firstname"
              value={signupForm.firstName}
              type="text"
              autoComplete="given-name"
              maxLength={MAX_LENGTH.name}
              onChange={(event) => setSignupField("firstName", event.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="signup-lastname">Last name</label>
            <input
              id="signup-lastname"
              value={signupForm.lastName}
              type="text"
              autoComplete="family-name"
              maxLength={MAX_LENGTH.name}
              onChange={(event) => setSignupField("lastName", event.target.value)}
            />
          </div>

          <EmailVerifyField verification={emailVerification} />

          <div className="auth-field">
            <label htmlFor="signup-password">Password</label>
            <PasswordInput
              id="signup-password"
              value={signupForm.password}
              autoComplete="new-password"
              aria-describedby="signup-password-checklist"
              onChange={(event) => setSignupField("password", event.target.value)}
            />
            <PasswordChecklist id="signup-password-checklist" password={signupForm.password} />
          </div>

          <div className="auth-field">
            <label htmlFor="signup-confirm-password">Confirm password</label>
            <PasswordInput
              id="signup-confirm-password"
              value={signupForm.confirmPassword}
              autoComplete="new-password"
              aria-describedby="signup-password-match"
              onChange={(event) => setSignupField("confirmPassword", event.target.value)}
            />
            <PasswordMatch
              id="signup-password-match"
              password={signupForm.password}
              confirmPassword={signupForm.confirmPassword}
            />
          </div>

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="primary-action" type="submit" disabled={isSubmitting || !emailVerified}>
            {isSubmitting ? "Registering..." : "Register"}
          </button>
        </form>
      )}
    </AuthScreen>
  );
}

export default LoginPage;
