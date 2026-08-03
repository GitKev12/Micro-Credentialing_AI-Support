import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchStudentDetail, storedAssessorId, timeAgo } from "../../services/assessors";
import { CheckIcon, UserIcon } from "./components/icons";
import { Chip, ScreenHeader } from "./components/ui";

const MODULE_CHIP = {
  done: { tone: "info", label: "Graded" },
  pending: { tone: "brand", label: "Awaiting your grade" },
  locked: { tone: "neutral", label: "Not started" }
};

function moduleMeta(module) {
  if (module.state === "pending") return `Submitted ${timeAgo(module.submittedAt)}`;
  if (module.state === "done") return "Quiz graded";
  return module.read ? "Lesson read — quiz not yet taken" : "Not yet attempted";
}

function credentialMeta(credential) {
  if (credential.status === "issued" && credential.issuedAt) {
    const date = new Date(credential.issuedAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
    return `Issued ${date}`;
  }
  return "Awaiting your approval";
}

function StudentPage() {
  const navigate = useNavigate();
  const { classId, studentId } = useParams();
  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    const assessorId = storedAssessorId();
    if (!assessorId || !classId || !studentId) {
      setLoadError(true);
      return undefined;
    }

    fetchStudentDetail(assessorId, classId, studentId)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, [classId, studentId]);

  if (loadError || !detail) {
    return (
      <>
        <ScreenHeader
          back={{ label: "Students", onClick: () => navigate(`/assessor/classes/${classId}`) }}
          eyebrow="Student"
          title={loadError ? "Student not found" : "Loading student…"}
        />
        <div className="assessor-body">
          <p className="assessor-meta">
            {loadError
              ? "This student could not be loaded for this class."
              : "Fetching module progress and credentials…"}
          </p>
        </div>
      </>
    );
  }

  const { student, course, modules, credentials, waiting } = detail;
  const issuedCount = credentials.filter((credential) => credential.status === "issued").length;

  return (
    <>
      <ScreenHeader
        back={{
          label: course.name,
          onClick: () => navigate(`/assessor/classes/${course.id}`)
        }}
        eyebrow={`${course.code} · ${course.name}`}
        title={student.name}
      />

      <div className="assessor-body assessor-stack">
        <section className="student-hero">
          <span className="person__disc person__disc--lg">
            <UserIcon size={62} color="var(--brand)" />
          </span>

          <div className="student-hero__lead">
            <div className="student-hero__name">{student.name}</div>
            <div className="student-hero__meta">{student.sid}</div>
          </div>

          <div className="student-hero__stats">
            <div>
              <div className="metric__label">Total points</div>
              <div className="student-hero__value">{detail.points}</div>
            </div>
            <div>
              <div className="metric__label">Credentials</div>
              <div className="student-hero__value student-hero__value--brand">
                {issuedCount} / {detail.totalModules}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate("/assessor/queue")}
            >
              Grade pending work
            </button>
          </div>
        </section>

        <div className="student-split">
          <section className="assessor-card">
            <h2 className="assessor-card-title">
              Modules — {course.code} {course.name}
            </h2>

            <div className="assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
              {modules.map((module) => {
                const chip = MODULE_CHIP[module.state];
                const locked = module.state === "locked";

                return (
                  <div key={module.moduleId} className="module-row">
                    <span className={`module-row__num${locked ? " is-locked" : ""}`}>
                      {module.n}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="cell-title" style={{ display: "block" }}>
                        {module.title}
                      </span>
                      <span className="assessor-meta">{moduleMeta(module)}</span>
                    </span>
                    <span className={`module-row__score${locked ? " is-locked" : ""}`}>
                      {module.score !== null ? `${module.score}/${module.total}` : "—"}
                    </span>
                    <span>
                      <Chip tone={chip.tone}>{chip.label}</Chip>
                    </span>
                  </div>
                );
              })}

              {modules.length === 0 ? (
                <p className="assessor-meta" style={{ padding: "var(--sp-4)", textAlign: "center" }}>
                  This course has no modules yet.
                </p>
              ) : null}
            </div>
          </section>

          <div className="assessor-stack">
            <section className="assessor-card">
              <h2 className="assessor-card-title">Micro-credentials</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                {credentials.map((credential) => (
                  <div key={credential.submissionId} className="cred-line">
                    <span className={`cred-line__mark${credential.status === "issued" ? " is-earned" : ""}`}>
                      <CheckIcon size={16} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="cred-line__name" style={{ display: "block" }}>
                        {credential.name}
                      </span>
                      <span className="assessor-meta">{credentialMeta(credential)}</span>
                    </span>
                  </div>
                ))}

                {credentials.length === 0 ? (
                  <p className="assessor-meta">No credentials earned yet.</p>
                ) : null}
              </div>
            </section>

            {waiting ? (
              <section className="callout">
                <div className="callout__eyebrow">Waiting on you</div>
                <h2 className="callout__title">{waiting.credentialName}</h2>
                <p className="callout__body">
                  {waiting.aiScore !== null
                    ? `AI scored ${waiting.assessmentTitle} at ${waiting.aiScore}/${waiting.total}. Confirm or adjust the grade to release this credential.`
                    : `${waiting.assessmentTitle} needs manual grading. Approve a final grade to release this credential.`}
                </p>
                <button
                  type="button"
                  className="btn btn--light"
                  onClick={() => navigate(`/assessor/review/${waiting.submissionId}`)}
                >
                  Open assessment review
                </button>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export default StudentPage;
