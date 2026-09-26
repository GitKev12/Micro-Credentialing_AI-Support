import { ArchiveIcon } from "../icons";

// "active", "inactive" (can't sign in) or "archived" (can't sign in, hidden).
export const accountStatusOf = (account) =>
  account?.archived ? "archived" : account?.suspended ? "inactive" : "active";

const LABELS = { active: "Active", inactive: "Inactive", archived: "Archived" };

// The small status pill used in the Students and Assessors tables and detail screens.
export function AccountStatusPill({ status }) {
  return (
    <span className={`admin-status-pill admin-status-pill--${status}`}>
      {status === "archived" ? <ArchiveIcon /> : null}
      {LABELS[status]}
    </span>
  );
}
