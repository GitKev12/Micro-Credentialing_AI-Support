import axios from "axios";
import { clearAuthSession, getAuthToken } from "../auth/services/session";

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
 * A 401 means the token is missing, expired or no longer trusted. Drop the
 * dead session and send them back to sign in — otherwise the app sits on a
 * stale token and every screen fails on its own.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthSession();
      const loginPath = window.location.pathname.startsWith("/admin")
        ? "/admin-login"
        : "/login";
      if (window.location.pathname !== loginPath) {
        window.location.assign(loginPath);
      }
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
