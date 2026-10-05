import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { checkEmail, checkName, MAX_LENGTH } from "../../lib/fieldRules";
import { getStoredSession, login, saveAuthSession, signupStudent } from "../services/authService";

const PARALLAX_SHIFT = 18;
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_TOO_LONG = "Password can be at most 72 bytes.";
const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

function passwordError(password, confirmPassword) {
  if (!password) return "Password is required.";
  if (password.length < MIN_PASSWORD_LENGTH) return "Password must be at least 8 characters.";
  if (byteLength(password) > MAX_LENGTH.password) return PASSWORD_TOO_LONG;
  if (password !== confirmPassword) return "Passwords must match.";
  return null;
}

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const backgroundRef = useRef(null);
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

  const moveBackground = (offsetX, offsetY) => {
    const background = backgroundRef.current;
    if (!background) return;
    background.style.transform = `scale(1.12) translate3d(${offsetX}px, ${offsetY}px, 0)`;
  };

  const handlePointerMove = (event) => {
    if (prefersReducedMotion()) return;
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;
    moveBackground(-x * PARALLAX_SHIFT, -y * PARALLAX_SHIFT);
  };

  const resetBackground = () => moveBackground(0, 0);

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

  const signupMessage = location.state?.message;

  return (
    <section
      className="login-screen"
      onMouseMove={handlePointerMove}
      onMouseLeave={resetBackground}
    >
      <div className="login-screen__bg" ref={backgroundRef} aria-hidden="true" />
      <article className={`login-card${!isLogin ? " signup-card" : ""}`}>
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

        {isLogin && signupMessage ? (
          <p className="auth-success" role="status">
            {signupMessage}
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
      </article>
    </section>
  );
}

export default LoginPage;
