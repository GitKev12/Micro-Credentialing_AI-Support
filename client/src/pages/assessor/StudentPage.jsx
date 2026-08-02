import { useNavigate, useParams } from "react-router-dom";
import data from "./assessorSampleData.json";
import { CheckIcon, UserIcon } from "./components/icons";
import { Chip, ScreenHeader } from "./components/ui";

const MODULE_CHIP = {
  done: { tone: "info", label: "Graded" },
  pending: { tone: "brand", label: "Awaiting your grade" },
  locked: { tone: "neutral", label: "Not started" }
};

function StudentPage() {
  const navigate = useNavigate();
  const { classId, studentId } = useParams();

  const course = data.classes.find((c) => c.id === classId) ?? data.classes[0];
  const student = data.roster.find((s) => s.id === studentId) ?? data.roster[0];
  const detail = data.studentDetail;

  // The queue entry for this student, so "Open assessment review" lands right.
  const submission = data.queue.find((row) => row.studentId === student.id);

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
            <div className="student-hero__meta">
              {student.sid} · {detail.program}
            </div>
          </div>

          <div className="student-hero__stats">
            <div>
              <div className="metric__label">Total points</div>
              <div className="student-hero__value">{detail.points}</div>
            </div>
            <div>
              <div className="metric__label">Credentials</div>
              <div className="student-hero__value student-hero__value--brand">
                {student.creds} / {data.totalModules}
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
            <h2 className="assessor-card-title">{detail.courseLabel}</h2>

            <div className="assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
              {detail.modules.map((module) => {
                const chip = MODULE_CHIP[module.state];
                const locked = module.state === "locked";

                return (
                  <div key={module.n} className="module-row">
                    <span className={`module-row__num${locked ? " is-locked" : ""}`}>
                      {module.n}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="cell-title" style={{ display: "block" }}>
                        {module.title}
                      </span>
                      <span className="assessor-meta">{module.meta}</span>
                    </span>
                    <span className={`module-row__score${locked ? " is-locked" : ""}`}>
                      {module.score}
                    </span>
                    <span>
                      <Chip tone={chip.tone}>{chip.label}</Chip>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="assessor-stack">
            <section className="assessor-card">
              <h2 className="assessor-card-title">Micro-credentials</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                {detail.credentials.map((credential) => (
                  <div key={credential.name} className="cred-line">
                    <span className={`cred-line__mark${credential.earned ? " is-earned" : ""}`}>
                      <CheckIcon size={16} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="cred-line__name" style={{ display: "block" }}>
                        {credential.name}
                      </span>
                      <span className="assessor-meta">{credential.meta}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="callout">
              <div className="callout__eyebrow">{detail.waitingOnYou.eyebrow}</div>
              <h2 className="callout__title">{detail.waitingOnYou.title}</h2>
              <p className="callout__body">{detail.waitingOnYou.body}</p>
              <button
                type="button"
                className="btn btn--light"
                onClick={() =>
                  navigate(`/assessor/review/${submission?.id ?? data.queue[0].id}`)
                }
              >
                Open assessment review
              </button>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

export default StudentPage;
