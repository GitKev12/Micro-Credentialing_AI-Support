import { AssessmentIcon, CoursesIcon, CredentialIcon, UserIcon } from "../icons";
import { BackLink, SectionTitle, StatTile } from "../ui";
import { SkeletonDetail } from "../../../../components/Skeleton";
import AssessorForm from "./AssessorForm";
import { backlogPhrase, EMPTY_WORKLOAD, lastActiveLabel, papersNote } from "./assessorText";

/**
 * One assessor, opened from the list.
 *
 * A screen of its own rather than the other half of an `if` inside the list:
 * the two share a route and nothing else, and reading either one meant
 * scrolling past the whole of the other.
 */
export default function AssessorDetail({
  assessor,
  detailStatus,
  busy,
  notice,
  form,
  formError,
  onBack,
  onEdit,
  onDelete,
  onCancelForm,
  onSave
}) {
  const selected = assessor;
  const classes = selected.classes ?? [];
  const workload = selected.workload ?? EMPTY_WORKLOAD;

  return (
      <div className="admin-main__inner">
        <BackLink onClick={onBack}>Assessors Management</BackLink>

        {detailStatus === "loading" ? (
          <SkeletonDetail label="Loading assessor…" />
        ) : detailStatus === "error" ? (
          <p className="admin-empty-note">Couldn&apos;t load this assessor.</p>
        ) : (
          <>
            <div className="admin-identity">
              <div className="admin-identity__disc">
                <UserIcon size={46} color="var(--brand)" />
              </div>
              <div>
                <h1 className="admin-identity__name">
                  {selected.name}
                  <span
                    className={`admin-status-pill${
                      selected.suspended ? " admin-status-pill--off" : ""
                    }`}
                  >
                    {selected.suspended ? "Suspended" : "Active"}
                  </span>
                </h1>
                <p className="admin-identity__meta">
                  {[selected.assessorNumber, selected.email].filter(Boolean).join(" · ")}
                </p>
                <p className="admin-identity__meta">{lastActiveLabel(selected.lastActive)}</p>
              </div>

              <div className="admin-identity__actions">
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

            {notice ? (
              <p className={`admin-notice admin-notice--${notice.tone}`} role="status">
                {notice.text}
              </p>
            ) : null}

            {/* The pill above says the account is locked and the tiles below
                say what it owes, and until now nothing joined the two. A
                suspended assessor cannot sign in, so their share of the work
                is not late — it is stopped, and the courses under it are
                silent for as long as the suspension stands. */}
            {selected.suspended && backlogPhrase(workload) ? (
              <p className="admin-notice admin-notice--warn" role="status">
                <strong>Suspended with work outstanding</strong> — {backlogPhrase(workload)}.
              </p>
            ) : null}

            <div className="admin-detail-stack">
              <section className="admin-card">
                {/* The two numbers the assessor's own console reports about
                    itself, in the order it runs them. Papers first, because
                    nothing else can happen until something is posted: no
                    student can take a quiz, so no mark arrives to release and
                    no credential comes of it. */}
                <div className="admin-stats admin-stats--flush admin-stats--compact">
                  <StatTile
                    icon={AssessmentIcon}
                    value={workload.toPost}
                    label="Assessments to post"
                    note={papersNote(workload)}
                  />
                  <StatTile
                    icon={CredentialIcon}
                    value={workload.credentialsPending}
                    label="Credentials to issue"
                    note={
                      workload.credentialsIssued > 0
                        ? `${workload.credentialsIssued} issued so far`
                        : null
                    }
                  />
                </div>
              </section>

              {/* One row per assigned course, because the course is the unit of
                  work here: a paper is written for a course and posted to all
                  of it at once, and the marks and credentials that follow are
                  counted against that one. The courses and the numbers about
                  them used to be two cards that had to be read against each
                  other to answer a question about a single course.

                  Read-only — assignment is made on Classes Management, where an
                  assessor takes a course by being put on one of its classes. */}
              <section className="admin-table-card">
                <div className="admin-table-head">
                  <SectionTitle icon={CoursesIcon}>Assigned Courses</SectionTitle>
                </div>

                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Code</th>
                      <th className="is-center">Students</th>
                      <th className="is-center">Assessments posted</th>
                      <th className="is-center">To issue</th>
                      <th className="is-center">Issued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((row) => {
                      return (
                        <tr className="admin-table__static" key={row.id}>
                          <td>
                            <span className="admin-cell__quiet">{row.title || row.code}</span>
                            {/* Qualifies every figure on the row, so it sits on
                                the course rather than on any one column: the
                                counts are the course's, and a co-assessor's
                                posting shows here as though it were this
                                assessor's own. */}
                            {row.sharedWith > 0 ? (
                              <span className="admin-cell__sub">
                                Shared with {row.sharedWith} other assessor
                                {row.sharedWith === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <span className="admin-cell__quiet">{row.code}</span>
                          </td>
                          <td className="is-center">{row.students}</td>
                          {/* Against what the course owes, not on its own: six
                              papers is most of the way through a five-lesson
                              course and barely started on a twenty-lesson one. */}
                          <td className="is-center">
                            <span
                              className={`admin-count${row.toPost > 0 ? " admin-count--warn" : ""}`}
                            >
                              {row.papersPosted} / {row.papersExpected}
                            </span>
                            {row.papersDraft > 0 ? (
                              <span className="admin-cell__sub">
                                {row.papersDraft === 1 ? "1 draft" : `${row.papersDraft} drafts`}
                              </span>
                            ) : null}
                          </td>
                          <td className="is-center">
                            <span
                              className={`admin-count${
                                row.credentialsPending > 0 ? " admin-count--warn" : ""
                              }`}
                            >
                              {row.credentialsPending}
                            </span>
                          </td>
                          <td className="is-center">
                            <strong className="admin-strong-brand">{row.credentialsIssued}</strong>
                          </td>
                        </tr>
                      );
                    })}
                    {classes.length === 0 ? (
                      <tr className="admin-table__empty">
                        <td colSpan={6}>
                          Not assigned to any course yet.
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
          <AssessorForm
            assessor={form}
            busy={busy}
            error={formError}
            onCancel={onCancelForm}
            onSave={onSave}
          />
        ) : null}
      </div>
  );
}
