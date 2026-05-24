import api from "../../../shared/services/api";

export async function getProfessorOverview() {
  const { data } = await api.get("/professors/overview");
  return data;
}
