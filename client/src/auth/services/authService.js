import api from "../../services/api";

export {
  clearAuthSession,
  getAuthToken,
  getStoredSession,
  saveAuthSession
} from "./session";

export async function login(credentials) {
  const { data } = await api.post("/auth/login", credentials);
  return data;
}

export async function loginAdmin(credentials) {
  const { data } = await api.post("/auth/admin/login", credentials);
  return data;
}

/**
 * What is closed for whoever is signed in, right now.
 *
 * The courses this student's assessor or administrator has shut, as
 * `[{ courseId, by, reason }]`. The account's own standing is not in the body
 * and cannot be: a suspended account is refused this request like any other,
 * and the axios layer reports that refusal on its own (see api.js).
 *
 * Asked on a timer by SessionStanding. Small on purpose — it is the one
 * request a student who is doing nothing makes.
 */
export async function fetchStanding() {
  const { data } = await api.get("/auth/standing");
  return Array.isArray(data?.courses) ? data.courses : [];
}
