import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api"
});

export async function getHealthStatus() {
  const { data } = await api.get("/health");
  return data;
}

export async function getSystemOverview() {
  const { data } = await api.get("/overview");
  return data;
}

export default api;
