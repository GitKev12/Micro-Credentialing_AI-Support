import api from "../../../shared/services/api";

export async function getStudentOverview() {
  const { data } = await api.get("/students/overview");
  return data;
}
