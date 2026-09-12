import axios from "axios";
import { clearAuthSession, getAuthToken } from "../auth/services/session";
import { reportAccountSuspension } from "../auth/services/standing";

/**
 * In development this stays "/api" and Vite proxies it to the server (see
 * vite.config.js). A built client has no proxy, so VITE_API_URL must name the
 * API's own origin at build time — Vite inlines it, and a value supplied after
 * the build is too late to matter.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api"
});

/** Every request carries the session token; the server now insists on it. */
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * The two refusals that are about the caller rather than about what they asked
 * for, and so cannot be left to the screen that happened to make the request.
 *
 * A 401 means the token is missing, expired or no longer trusted. Drop the
 * dead session and send them back to sign in — otherwise the app sits on a
 * stale token and every screen fails on its own.
 *
 * A 423 scoped to the account means they are suspended: the token is sound and
 * the server will not act on it (see server lib/suspension.js). It is recorded
 * rather than acted on here, because what happens next is a sentence on screen
 * and this layer has no business drawing one — see SessionStanding, which is
 * watching. The error still rejects, so the screen that asked handles its own
 * failure as it always did.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const { status, data } = error.response ?? {};

    if (status === 401) {
      clearAuthSession();
      // One login now serves every role; there is no separate admin door.
      const loginPath = "/login";
      if (window.location.pathname !== loginPath) {
        window.location.assign(loginPath);
      }
    }

    if (status === 423 && data?.scope === "account") {
      reportAccountSuspension(data);
    }

    return Promise.reject(error);
  }
);

/**
 * Adds the token to a URL the browser will fetch by itself — an <img src> or
 * an <a href> carries no headers, so those routes accept ?token= instead.
 */
export function withAuthToken(url) {
  const token = getAuthToken();
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

export default api;
