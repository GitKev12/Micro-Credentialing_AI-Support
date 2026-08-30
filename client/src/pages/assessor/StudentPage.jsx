import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ScoreBarChart } from "../../components/ScoreBarChart";
import { certificateFileUrl } from "../../services/achievements";
import { fetchStudentDetail, storedAssessorId } from "../../services/assessors";
import { CredentialIcon, DownloadIcon, UserIcon } from "./components/icons";
import { Chip, ScreenHeader } from "./components/ui";

/** The server's own pass ratio, used until a run reports its own threshold. */
const PASS_MARK = 60;

const MODULE_CHIP = {
  done: { tone: "info", label: "Graded" },
  pending: { tone: "brand", label: "Awaiting your grade" },
  locked: { tone: "neutral", label: "Not started" }
};

/** Dates here are read off the record, so they are written out rather than
 *  counted back from today. */
function formatDate(value, { year = true } = {}) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {})
  });
}

/** Course artwork when the catalog carries it, the older emoji glyph otherwise. */
function BadgeArt({ badge }) {
  const isImage = badge.icon && (badge.iconType === "svg" || badge.icon.startsWith("data:"));

  return (
    <span className="badge-tile__art" aria-hidden="true">
      {isImage ? <img src={badge.icon} alt="" /> : (badge.icon ?? "🏅")}
    </span>
  );
}

function badgeMeta(badge) {
  if (!badge.earned) return "Not earned";

  const date = formatDate(badge.earnedAt, { year: false });
  return date ? `Earned ${date}` : "Earned";
}

/**
 * The final exam, one column per lesson, read against the pass mark.
 *
 * The line is the encoding: a column standing below it is a gap, which is what
 * an assessor opens this page to find. Colour says the same thing a second
 * time, and because green against red is the one pair colour-blind readers
 * cannot separate, it never says it alone — a weak column is also striped, is
 * the only one carrying its own number, and is counted in the sentence
 * underneath.
 *
 * Before the exam is taken the same frame is drawn empty: the pass line, and
 * one waiting seat per lesson of the course. The chart is the thing being
 * looked at, so the empty state is the chart — a paragraph standing in its
 * place made the hero change shape the moment a student took the exam, and
 * said nothing the plot does not already show.
 */
function PerformanceChart({ skillGap, modules, lessonNumbers }) {
  const threshold = skillGap?.threshold ?? PASS_MARK;
  const skills = skillGap?.skills ?? [];
  const taken = skills.length > 0;

  const weak = skills.filter((skill) => skill.score < threshold);
  const weakest = weak.reduce(
    (lowest, skill) => (lowest === null || skill.score < lowest.score ? skill : lowest),
    null
  );

  // A scored bar per topic once the exam is taken; before that, a waiting seat
  // per lesson — full height in a flat neutral, so the plot shows the scale it
  // will be read against without any bar reading as a perfect score.
  const bars = taken
    ? skills.map((skill, index) => {
        const isWeak = skill.score < threshold;

        return {
          label: String(lessonNumbers.get(skill.moduleId) ?? index + 1),
          score: skill.score,
          color: isWeak ? "--skill-weak" : "--skill-strong",
          tooltip: `${skill.topic} — ${skill.score}% (${skill.correct}/${skill.total}), ${
            isWeak ? "weak" : "strong"
          }`
        };
      })
    : modules.map((module) => ({
        label: String(module.n),
        score: 100,
        color: "--gray-150",
        tooltip: `Lesson ${module.n} — not taken yet`
      }));

  let caption = "Not taken yet";
  if (taken && weak.length === 0) {
    caption = `Every topic at or above the ${threshold}% pass mark.`;
  } else if (taken) {
    caption = `${weak.length} of ${skills.length} topics below ${threshold}% — weakest is ${weakest.topic} at ${weakest.score}%.`;
  }

  return (
    <div className="student-hero__chart">
      <div className="hero-chart__head">
        <span className="metric__label">Performance — final exam</span>
        {taken ? (
          <span className="hero-chart__score">
            {skillGap.performance}%
            {skillGap.released ? null : <Chip tone="brand-soft">Provisional</Chip>}
          </span>
        ) : (
          <span className="hero-chart__score hero-chart__score--waiting">—</span>
        )}
      </div>

      <ScoreBarChart
        className="hero-chart"
        bars={bars}
        target={threshold}
        height={96}
        lineColor="--gray-300"
        textColor="--text-muted"
        ariaLabel={
          taken
            ? `${skills.map((skill) => `${skill.topic}: ${skill.score} percent`).join(", ")}. The pass mark is ${threshold} percent.`
            : `One bar per lesson, empty — the final exam has not been taken. The pass mark is ${threshold} percent.`
        }
      />

      <p className="assessor-meta">{caption}</p>
    </div>
  );
}

function credentialMeta(credential) {
  if (credential.status !== "issued") return "Awaiting approval";

  const date = formatDate(credential.issuedAt, { year: false });
  return date ? `Issued ${date}` : "Issued";
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
  const badges = detail.badges ?? { earned: 0, total: detail.totalModules ?? 0 };
  const badgeItems = badges.items ?? [];
  const issuedCount = credentials.filter((credential) => credential.status === "issued").length;
  const gradedCount = modules.filter((module) => module.state === "done").length;
  const skillGap = detail.skillGap ?? null;
  // The chart's columns carry the lesson numbers the table uses, so a column
  // and a row point at the same lesson.
  const lessonNumbers = new Map(modules.map((module) => [module.moduleId, module.n]));

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
            <div className="student-hero__name">
              {student.name}
              <span className={`status-pill${student.suspended ? " status-pill--off" : ""}`}>
                {student.suspended ? "Suspended" : "Active"}
              </span>
            </div>
            {/* Number then address, the admin console's own identity line —
                a student is named the same way wherever staff meet them. Either
                may be missing on an older record, so neither is assumed. */}
            <div className="student-hero__meta">
              {[student.sid, student.email].filter(Boolean).join(" · ")}
            </div>
          </div>

          <PerformanceChart
            skillGap={skillGap}
            modules={modules}
            lessonNumbers={lessonNumbers}
          />
        </section>

        <div className="student-split">
          <section className="assessor-card">
            <header className="card-head">
              <h2 className="assessor-card-title">
                Modules — {course.code} {course.name}
              </h2>
              {modules.length ? (
                <span className="assessor-meta">
                  {gradedCount} of {modules.length} graded
                </span>
              ) : null}
            </header>

            {modules.length === 0 ? (
              <p className="assessor-meta">This course has no modules yet.</p>
            ) : (
              <div className="card-table">
                <table className="assessor-table">
                  <caption className="assessor-sr-only">
                    Every lesson in this course, when its quiz was taken, what it
                    scored and where it stands.
                  </caption>

                  <thead>
                    <tr>
                      <th scope="col">Lesson</th>
                      <th scope="col">Date taken</th>
                      <th scope="col" className="assessor-table__num">
                        Score
                      </th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {modules.map((module) => {
                      const chip = MODULE_CHIP[module.state];
                      const locked = module.state === "locked";
                      const takenOn = formatDate(module.submittedAt);

                      // An attempt can be opened; a lesson nobody has taken
                      // has nothing to open.
                      const openReview = module.submissionId
                        ? () => navigate(`/assessor/review/${module.submissionId}`)
                        : undefined;

                      return (
                        <tr
                          key={module.moduleId}
                          className={openReview ? "assessor-table__row" : undefined}
                          onClick={openReview}
                        >
                          <th scope="row">
                            <span className="module-cell">
                              <span className={`module-row__num${locked ? " is-locked" : ""}`}>
                                {module.n}
                              </span>
                              <span style={{ minWidth: 0 }}>
                                <span className="assessor-table__name">{module.title}</span>
                                {locked ? (
                                  <span className="assessor-table__sub">
                                    {module.read ? "Lesson read" : "Not opened"}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </th>

                          <td className="assessor-table__when">
                            {takenOn ?? <span className="assessor-table__dash">—</span>}
                          </td>

                          <td className="assessor-table__num">
                            {module.score !== null ? (
                              `${module.score}/${module.total}`
                            ) : (
                              <span className="assessor-table__dash">—</span>
                            )}
                          </td>

                          <td>
                            <Chip tone={chip.tone}>{chip.label}</Chip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="assessor-stack">
            <section className="assessor-card">
              <header className="card-head">
                <h2 className="assessor-card-title">Badges</h2>
                <span className="assessor-meta">
                  {badges.earned} of {badges.total} earned
                </span>
              </header>

              {badgeItems.length === 0 ? (
                <p className="assessor-meta">This course has no badges yet.</p>
              ) : (
                <ul className="badge-wall">
                  {badgeItems.map((badge) => (
                    <li
                      key={badge.id}
                      className="badge-tile"
                      data-earned={badge.earned ? "yes" : "no"}
                      title={badge.name}
                    >
                      <BadgeArt badge={badge} />
                      <span className="badge-tile__name">{badge.name}</span>
                      <span className="badge-tile__state">{badgeMeta(badge)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="assessor-card">
              <header className="card-head">
                <h2 className="assessor-card-title">Micro-credentials</h2>
                {credentials.length ? (
                  <span className="assessor-meta">
                    {issuedCount} of {credentials.length} issued
                  </span>
                ) : null}
              </header>

              {credentials.length === 0 ? (
                <p className="assessor-meta">No credentials yet.</p>
              ) : (
                <ul className="badge-wall badge-wall--wide">
                  {credentials.map((credential) => {
                    const certificate = credential.certificate;

                    const body = (
                      <>
                        <span className="badge-tile__art cred-tile__art" aria-hidden="true">
                          <CredentialIcon size={24} />
                        </span>
                        <span className="badge-tile__name">{credential.name}</span>
                        <span className="badge-tile__state">{credentialMeta(credential)}</span>
                        {certificate ? (
                          <span className="badge-tile__action">
                            <DownloadIcon size={13} />
                            Certificate
                          </span>
                        ) : null}
                      </>
                    );

                    // The stamped sheet opens in its own tab, so the browser
                    // shows exactly what the student was given. A credential
                    // still awaiting release has no sheet to open.
                    return (
                      <li
                        key={credential.submissionId}
                        className="badge-tile"
                        data-earned={credential.status === "issued" ? "yes" : "no"}
                        title={credential.name}
                      >
                        {certificate ? (
                          <a
                            className="badge-tile__link"
                            href={certificateFileUrl(student.id, certificate.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {body}
                          </a>
                        ) : (
                          body
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
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
