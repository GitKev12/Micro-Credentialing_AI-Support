import api from "./api";

export async function fetchDiscoverCourses(studentId) {
  const { data } = await api.get(`/students/${studentId}/discover`);
  return data.courses ?? [];
}
export async function fetchDiscoverCourse(studentId, courseId) {
  const { data } = await api.get(`/students/${studentId}/discover/${courseId}`);
  return data;
}
export async function enrollInClass(studentId, classId) {
  const { data } = await api.post(`/students/${studentId}/classes/${classId}/enroll`);
  return data;
}
export async function cancelEnrollRequest(studentId, classId) {
  const { data } = await api.delete(`/students/${studentId}/classes/${classId}/request`);
  return data;
}
export async function setDiscoverSettings(classId, settings) {
  const { data } = await api.patch(`/admin/classes/${classId}/discover`, settings);
  return data.class;
}
export async function acceptRequest(classId, studentId) {
  const { data } = await api.post(`/admin/classes/${classId}/requests/${studentId}/accept`);
  return data.class;
}
export async function declineRequest(classId, studentId) {
  const { data } = await api.post(`/admin/classes/${classId}/requests/${studentId}/decline`);
  return data.class;
}
