import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ColumnPlot } from "../../components/ColumnPlot";
import { certificateFileUrl } from "../../services/achievements";
import { fetchStudentDetail, storedAssessorId } from "../../services/assessors";
import { CredentialIcon, DownloadIcon, UserIcon } from "./components/icons";
import { ScreenHeader } from "./components/ui";
import { SkeletonDetail } from "../../components/Skeleton";

/** The server's own pass ratio, used until a run reports its own threshold. */
const PASS_MARK = 60;

/**
 * How long a sitting took, written the way a person says it.
 *
 * Hours only appear once there are any — "5m" rather than "0h 5m", because a
 * column of leading zeroes is harder to scan than the numbers themselves. A
 * sitting under a minute still reads as "1m": the point of the column is how
 * long somebody worked, and "0m" reads as a failure to record rather than as a
 * very fast paper.
 */
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const minutes = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** The clock the assessor set, when they set one. Most papers are untimed. */
function formatLimit(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

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

  // A scored column per topic once the exam is taken; before that, a waiting
  // seat per lesson, full height in a neutral so it reads as an empty slot
  // rather than a perfect score.
  const columns = taken
    ? skills.map((skill, index) => {
        const isWeak = skill.score < threshold;

        return {
          key: skill.moduleId ?? `${skill.topic}:${index}`,
          score: skill.score,
          band: isWeak ? "weak" : "strong",
          title: `${skill.topic} — ${skill.score}% (${skill.correct}/${skill.total}), ${
            isWeak ? "weak" : "strong"
          }`,
          before: isWeak ? <span className="hero-chart__value">{skill.score}</span> : null,
          after: (
            <span className="hero-chart__tick">
              {lessonNumbers.get(skill.moduleId) ?? index + 1}
            </span>
          )
        };
      })
    : modules.map((module) => ({
        key: module.moduleId,
        score: 100,
        barClass: "hero-chart__bar--waiting",
        after: <span className="hero-chart__tick">{module.n}</span>
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
          <span className="hero-chart__score">{skillGap.performance}%</span>
        ) : (
          <span className="hero-chart__score hero-chart__score--waiting">—</span>
        )}
      </div>

      <ColumnPlot
        prefix="hero-chart"
        columns={columns}
        target={threshold}
        targetLabel={`${threshold}% pass`}
        role="img"
        ariaLabel={
          taken
            ? skills.map((skill) => `${skill.topic}: ${skill.score} percent`).join(", ")
            : `One column per lesson, empty — the final exam has not been taken. The pass mark is ${threshold} percent.`
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

/**
 * The three columns a sitting fills: when it was taken, what it scored, and how
 * long it ran.
 *
 * One component because the final exam's row and a lesson's row are the same
 * question asked of different papers, and a column that formatted one of them
 * differently would read as a difference in the data.
 */
/**
 * The line under the final's title.
 *
 * The final is the only paper with a ceiling on sittings, so a taken one says
 * which of the three this was. An untaken one says what it is waiting on, and
 * "not posted" is the assessor's own doing rather than the student's — those
 * are different facts and the row should not report both as "not taken".
 */
function finalNote(final) {
  if (final.state !== "done") return final.posted ? "Not taken" : "Not posted yet";
  return `Attempt ${final.attempt} of ${final.attemptsAllowed}`;
}

function SittingCells({ row }) {
  const takenOn = formatDate(row.submittedAt);
  const took = formatDuration(row.durationMs);
  const limit = formatLimit(row.timeLimitMinutes);

  return (
    <>
      <td className="assessor-table__when">
        {takenOn ?? <span className="assessor-table__dash">—</span>}
      </td>

      <td className="assessor-table__num">
        {row.score !== null ? (
          `${row.score}/${row.total}`
        ) : (
          <span className="assessor-table__dash">—</span>
        )}
      </td>

      {/* A time limit is the assessor's to set and most papers have none, so it
          only appears where one was given — and then as what the sitting ran
          against, which is the only thing that makes a duration mean
          anything. */}
      <td className="assessor-table__when">
        {took ? (
          <>
            {took}
            {limit ? <span className="assessor-table__sub">of {limit} allowed</span> : null}
          </>
        ) : (
          <span className="assessor-table__dash">—</span>
        )}
      </td>
    </>
  );
}

function StudentPage() {
  const navigate = useNavigate();
  const { courseId, studentId } = useParams();
  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    const assessorId = storedAssessorId();
    if (!assessorId || !courseId || !studentId) {
      setLoadError(true);
      return undefined;
    }

    fetchStudentDetail(assessorId, courseId, studentId)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, [courseId, studentId]);

  if (loadError || !detail) {
    return (
      <>
        <ScreenHeader
          back={{ label: "Students", onClick: () => navigate(`/assessor/classes/${courseId}`) }}
          eyebrow="Student"
          title={loadError ? "Student not found" : "Student"}
        />
        <div className="assessor-body">
          {loadError ? (
            <p className="assessor-meta">
              This student could not be loaded for this class.
            </p>
          ) : (
            <SkeletonDetail label="Fetching module progress and credentials…" />
          )}
        </div>
      </>
    );
  }

  const { student, course, modules, credentials } = detail;
  const final = detail.final ?? null;
  const badges = detail.badges ?? { earned: 0, total: detail.totalModules ?? 0 };
  const badgeItems = badges.items ?? [];
  const issuedCount = credentials.filter((credential) => credential.status === "issued").length;
  const takenCount = modules.filter((module) => module.state === "done").length;
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
                  {takenCount} of {modules.length} taken
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
                    scored and how long the student took over it.
                  </caption>

                  <thead>
                    <tr>
                      <th scope="col">Lesson</th>
                      <th scope="col">Date taken</th>
                      <th scope="col" className="assessor-table__num">
                        Score
                      </th>
                      <th scope="col">Time taken</th>
                    </tr>
                  </thead>

                  <tbody>
                    {modules.map((module) => {
                      const locked = module.state === "locked";

                      return (
                        <tr key={module.moduleId}>
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

                          <SittingCells row={module} />
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* The final is not a lesson and carries no lesson number, so
                      it sits in its own row below the numbered list rather than
                      at the end of it. */}
                  {final ? (
                    <tfoot>
                      <tr className="module-row--final">
                        <th scope="row">
                          <span className="module-cell">
                            <span className="module-row__num module-row__num--none" aria-hidden="true" />
                            <span style={{ minWidth: 0 }}>
                              <span className="assessor-table__name">{final.title}</span>
                              <span className="assessor-table__sub">
                                {finalNote(final)}
                              </span>
                            </span>
                          </span>
                        </th>

                        <SittingCells row={final} />
                      </tr>
                    </tfoot>
                  ) : null}
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

          </div>
        </div>
      </div>
    </>
  );
}

export default StudentPage;
