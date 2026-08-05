import { CertificateIcon, CheckIcon, LockIcon } from "./icons";
import { EmptyState } from "./ui";

/**
 * Micro-credentials on the student's record.
 *
 * These are the formal awards: an assessor released each one after approving
 * a final grade, so every row can name the course it came from and the date
 * it was issued. A credential still awaiting release is shown too, plainly
 * labelled — the student can see it is coming without being told they hold it.
 */

function formatDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function Certificate({ certification }) {
  const issued = certification.status === "issued";
  const issuedOn = formatDate(certification.issuedAt);
  const hasScore =
    certification.score !== null &&
    certification.score !== undefined &&
    certification.totalPoints;

  return (
    <li className="sd-cert" data-status={certification.status}>
      <span className="sd-cert__seal" aria-hidden="true">
        <CertificateIcon size={20} />
      </span>

      <div className="sd-cert__text">
        <p className="sd-cert__name">{certification.name}</p>
        <p className="sd-cert__meta">
          {[certification.courseCode, certification.courseTitle || certification.assessmentTitle]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="sd-cert__side">
        <span className="sd-cert__state">
          {issued ? <CheckIcon size={13} /> : <LockIcon size={13} />}
          {issued ? "Issued" : "Awaiting release"}
        </span>
        {issued && issuedOn ? <span className="sd-cert__date">{issuedOn}</span> : null}
        {hasScore ? (
          <span className="sd-cert__date">
            {certification.score}/{certification.totalPoints}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function Certifications({ certifications = [] }) {
  const issuedCount = certifications.filter((entry) => entry.status === "issued").length;

  return (
    <section className="sd-card" aria-labelledby="sd-certs-title">
      <header className="sd-section-head">
        <div className="sd-section-head__text">
          <p className="sd-eyebrow">Certification</p>
          <h2 className="sd-h3" id="sd-certs-title">
            Your micro-credentials
          </h2>
          <p className="sd-sub">
            {issuedCount
              ? `${issuedCount} issued after an assessor approved your final grade.`
              : "Issued by an assessor once your final grade is approved."}
          </p>
        </div>
      </header>

      {certifications.length === 0 ? (
        <EmptyState title="No credentials yet">
          Complete a course assessment and your assessor will release its
          micro-credential here.
        </EmptyState>
      ) : (
        <ul className="sd-cert__list">
          {certifications.map((certification) => (
            <Certificate key={certification.id} certification={certification} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default Certifications;
