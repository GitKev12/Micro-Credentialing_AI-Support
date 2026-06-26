import api from "./api";

/**
 * Avatar resolution helpers.
 *
 * GridFS-backed profile images are NOT wired up yet. Once they are, the server
 * should stream the stored file from GridFS at:
 *
 *   GET /api/<role>s/:id/avatar   (e.g. /api/students/:id/avatar)
 *
 * and persist a reference to the uploaded file on the account document
 * (`avatarFileId`). Until that exists, `resolveAvatarUrl` returns null so the
 * UI falls back to an initials placeholder — no other code needs to change
 * when the backend is ready.
 */
export function resolveAvatarUrl(user) {
  if (!user) return null;

  // An already-resolved URL (e.g. an external profile image) takes priority.
  if (user.avatarUrl) return user.avatarUrl;

  // Reference to a file stored in GridFS, set on the account after upload.
  if (user.avatarFileId) {
    const base = (api.defaults.baseURL ?? "").replace(/\/$/, "");
    return `${base}/${user.role}s/${user.id}/avatar`;
  }

  return null;
}

export function getInitials(name) {
  if (!name) return "?";

  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}
