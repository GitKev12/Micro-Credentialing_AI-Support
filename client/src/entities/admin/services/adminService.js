import api from "../../../shared/services/api";

export async function getAdminOverview() {
  const { data } = await api.get("/admins/overview");
  return data;
}
