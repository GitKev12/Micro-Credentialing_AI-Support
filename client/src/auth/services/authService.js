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
