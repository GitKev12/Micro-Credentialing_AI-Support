import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { checkEmail, checkName, MAX_LENGTH } from "../../lib/fieldRules";
import AuthScreen from "../components/AuthScreen";
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
    confirmPassword: ""
  });

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

  const validateSignup = () =>
    checkName(signupForm.firstName, "First name") ||
    checkName(signupForm.lastName, "Last name") ||
    checkEmail(signupForm.email) ||
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
        password: signupForm.password
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

  // The session is in localStorage, so every tab shares it: a second tab
  // opened on /login goes straight to the console the first one signed into.
  const session = getStoredSession();
  if (session?.user) {
    return <Navigate to={session.redirectTo || `/${session.user.role}`} replace />;
  }

  // Set by signup or forgot password when they send the student back here.
  const statusMessage = location.state?.message;
  // An email typed in the sign-in box is carried over to forgot password.
  const typedEmail = identifier.includes("@") ? identifier.trim() : "";

  return (
    <AuthScreen cardClassName={isLogin ? "" : "signup-card"}>
      <p className="entity-label">{isLogin ? "Login" : "Student signup"}</p>
      <h1>{isLogin ? "Sign in" : "Create account"}</h1>

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
          <label className="auth-field">
            <span>ID Number or Email</span>
            <input
              value={identifier}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={MAX_LENGTH.email}
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={loginPassword}
              autoComplete="current-password"
              maxLength={MAX_LENGTH.password}
              onChange={(event) => setLoginPassword(event.target.value)}
            />
          </label>

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
          <label className="auth-field">
            <span>First name</span>
            <input
              value={signupForm.firstName}
              type="text"
              autoComplete="given-name"
              maxLength={MAX_LENGTH.name}
              onChange={(event) => setSignupField("firstName", event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Last name</span>
            <input
              value={signupForm.lastName}
              type="text"
              autoComplete="family-name"
              maxLength={MAX_LENGTH.name}
              onChange={(event) => setSignupField("lastName", event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Email</span>
            <input
              value={signupForm.email}
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={MAX_LENGTH.email}
              onChange={(event) => setSignupField("email", event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              value={signupForm.password}
              type="password"
              autoComplete="new-password"
              onChange={(event) => setSignupField("password", event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Confirm password</span>
            <input
              value={signupForm.confirmPassword}
              type="password"
              autoComplete="new-password"
              onChange={(event) => setSignupField("confirmPassword", event.target.value)}
            />
          </label>

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="primary-action" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>
      )}
    </AuthScreen>
  );
}

export default LoginPage;
