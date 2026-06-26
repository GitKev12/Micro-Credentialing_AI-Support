import api from "../../services/api";

const SESSION_STORAGE_KEY = "capstoneAuthSession";

export async function login(credentials) {
  const { data } = await api.post("/auth/login", credentials);
  return data;
}

export async function loginAdmin(credentials) {
  const { data } = await api.post("/auth/admin/login", credentials);
  return data;
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

export function clearAuthSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
