import { BadgeIcon, CoursesIcon, CredentialIcon, UserIcon } from "../icons";
import { Avatar, BackLink, SectionTitle, StatTile } from "../ui";
import { SkeletonDetail } from "../../../../components/Skeleton";
import ProgressCell from "./ProgressCell";
import StudentForm from "./StudentForm";
import { courseRows, lastActiveLabel, latestLine } from "./studentText";
import { formatDate } from "../../lib/format";
import { noticeClass } from "../../../../lib/useNotice";

/**
 * One student, opened from the list.
 *
 * Its own screen rather than the other half of an `if` inside the list — they
 * share a route and nothing else.
 */
export default function StudentDetail({
  student,
  detailStatus,
  busy,
  notice,
  form,
  formError,
  onBack,
  onEdit,
  onDelete,
  onToggleSuspended,
  onCancelForm,
  onSave
}) {
  const selected = student;
    const enrolled = selected.enrolled ?? [];
    const progress = selected.progress ?? [];
    const badges = selected.badges ?? { earned: 0, total: 0, courses: [], latest: null };
    const assessors = selected.assessors ?? [];
    const rows = courseRows(enrolled, progress, badges.courses ?? [], assessors);
    const latestCredential = progress
      .filter((row) => row.total > 0 && row.pct === 100 && row.completedAt)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];


  return (
      <div className="admin-main__inner">
        <BackLink onClick={onBack}>Students Management</BackLink>

        {detailStatus === "loading" ? (
          <SkeletonDetail label="Loading student…" />
        ) : detailStatus === "error" ? (
          <p className="admin-empty-note">Couldn&apos;t load this student.</p>
        ) : (
          <>
            <div className="admin-identity">
              <div className="admin-identity__disc">
                <UserIcon size={46} color="var(--brand)" />
              </div>
              <div>
                <h1 className="admin-identity__name">{selected.name}</h1>
                {/* A degree batch belongs to a registrar, not to a
                    micro-credential record — the student number and a way to
                    reach them are what this screen actually needs. */}
                <p className="admin-identity__meta">
                  {[selected.studentNumber, selected.email].filter(Boolean).join(" · ")}
                </p>
                <p className="admin-identity__meta">{lastActiveLabel(selected.lastActive)}</p>
              </div>

              {/* Two kinds of control, kept apart by a hairline. The switch
                  is a state — what this account is right now, readable at a
                  glance and reversible in one press. Edit and Delete are acts
                  performed on it. Run together as three chips they read as one
                  menu, and "Suspended" and "Delete" are not decisions of the
                  same weight. */}
              <div className="admin-identity__actions">
                <button
                  type="button"
                  className={`admin-switch admin-switch--lg${
                    selected.suspended ? "" : " is-on"
                  }`}
                  role="switch"
                  aria-checked={!selected.suspended}
                  disabled={busy}
                  onClick={onToggleSuspended}
                  title={
                    selected.suspended
                      ? `Activate ${selected.name}`
                      : `Suspend ${selected.name}`
                  }
                >
                  <span className="admin-switch__track">
                    <span className="admin-switch__thumb" />
                  </span>
                  <span className="admin-switch__label">
                    {selected.suspended ? "Suspended" : "Active"}
                  </span>
                </button>

                <div className="admin-identity__acts">
                  <button
                    type="button"
                    className="admin-chip-btn admin-chip-btn--quiet"
                    disabled={busy}
                    onClick={onEdit}
                  >
                    Edit details
                  </button>
                  <button
                    type="button"
                    className="admin-chip-btn admin-chip-btn--danger"
                    disabled={busy}
                    onClick={onDelete}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>

            {notice ? (
              <p className={noticeClass(notice, `admin-notice admin-notice--${notice.tone}`)} role="status">
                {notice.text}
              </p>
            ) : null}

            <div className="admin-detail-stack">
              <section className="admin-card">
                <div className="admin-stats admin-stats--flush admin-stats--compact">
                  <StatTile
                    icon={BadgeIcon}
                    value={badges.earned ?? 0}
                    label="Badges earned"
                    note={
                      badges.latest
                        ? latestLine(badges.latest.name, badges.latest.earnedAt)
                        : null
                    }
                  />
                  <StatTile
                    icon={CredentialIcon}
                    value={selected.credentials ?? 0}
                    label="Micro-credentials"
                    note={
                      latestCredential
                        ? latestLine(latestCredential.label, latestCredential.completedAt)
                        : null
                    }
                  />
                  <StatTile icon={CoursesIcon} value={enrolled.length} label="Active courses" />
                </div>
              </section>

              {/* One row per course, because the course is the record this system
                  keeps: a credential is earned per course, and progress, badges
                  and an assessor are all facts about one. They were four cards
                  that had to be read against each other to answer a question
                  about a single course; the row answers it across.

                  Read-only — enrolment is made on Classes Management, where a
                  student joins a course by being put in one of its classes. */}
              <section className="admin-table-card">
                <div className="admin-table-head">
                  <SectionTitle icon={CoursesIcon}>Enrolled Courses</SectionTitle>
                </div>

                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Code</th>
                      <th>Progress</th>
                      <th className="is-center">Badges</th>
                      <th>Assessor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr className="admin-table__static" key={row.id}>
                        <td>
                          <span className="admin-cell__quiet">{row.title}</span>
                        </td>
                        <td>
                          <span className="admin-cell__quiet">{row.code}</span>
                        </td>
                        <td>
                          <ProgressCell progress={row.progress} />
                        </td>
                        <td className="is-center">
                          {row.badges && row.badges.total > 0 ? (
                            <span
                              className="admin-count admin-count--badges"
                              data-earned={row.badges.earned > 0 ? "yes" : "no"}
                            >
                              {row.badges.earned} of {row.badges.total}
                            </span>
                          ) : (
                            <span className="admin-count admin-count--none">None yet</span>
                          )}
                        </td>
                        <td>
                          {row.assessors.length > 0 ? (
                            <span className="admin-cell__quiet">{row.assessors.join(", ")}</span>
                          ) : (
                            <span className="admin-count admin-count--none">Unassigned</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 ? (
                      <tr className="admin-table__empty">
                        <td colSpan={5}>
                          Not enrolled in any course yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            </div>
          </>
        )}

        {form ? (
          <StudentForm
            student={form}
            busy={busy}
            error={formError}
            onCancel={onCancelForm}
            onSave={onSave}
          />
        ) : null}
      </div>
  );
}
