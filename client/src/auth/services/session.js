/**
 * Where the signed-in session lives.
 *
 * Split out from authService so the axios layer can reach the token without
 * importing authService, which imports axios in turn — the interceptor needs
 * the token on every request, and a cycle between those two modules is a
 * fragile thing to rely on.
 */

const SESSION_STORAGE_KEY = "capstoneAuthSession";

export function getStoredSession() {
  const storedSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!storedSession) return null;

  try {
    return JSON.parse(storedSession);
  } catch (_error) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function saveAuthSession(authSession) {
  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      ...authSession,
      signedInAt: new Date().toISOString()
    })
  );
}

export function clearAuthSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

/** The bearer token, or "" when signed out. */
export function getAuthToken() {
  return getStoredSession()?.token ?? "";
}
