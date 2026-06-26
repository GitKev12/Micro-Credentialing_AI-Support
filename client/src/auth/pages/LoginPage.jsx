import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login, saveAuthSession } from "../services/authService";

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <section className="login-screen">
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
