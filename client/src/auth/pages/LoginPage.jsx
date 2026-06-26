import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login, saveAuthSession } from "../services/authService";

const PARALLAX_SHIFT = 18;
const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const backgroundRef = useRef(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const authSession = await login({ identifier, password });
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

  return (
    <section
      className="login-screen"
      onMouseMove={handlePointerMove}
      onMouseLeave={resetBackground}
    >
      <div className="login-screen__bg" ref={backgroundRef} aria-hidden="true" />
      <article className="login-card">
        <p className="entity-label">Login</p>
        <h1>Sign in</h1>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <input
              value={identifier}
              type="email"
              autoComplete="email"
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
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
      </article>
    </section>
  );
}

export default LoginPage;
