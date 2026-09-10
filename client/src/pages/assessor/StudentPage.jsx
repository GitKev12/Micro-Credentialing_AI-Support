import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ColumnPlot } from "../../components/ColumnPlot";
import { certificateFileUrl } from "../../services/achievements";
import { fetchStudentDetail, storedAssessorId } from "../../services/assessors";
import { CredentialIcon, DownloadIcon, UserIcon } from "./components/icons";
import { Chip, ProgressBar, ScreenHeader } from "./components/ui";
import { SkeletonDetail } from "../../components/Skeleton";

/** The server's own pass ratio, used until a run reports its own threshold. */
const PASS_MARK = 60;

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
 * place made the card change shape the moment a student took the exam, and
 * said nothing the plot does not already show.
 *
 * It is a card at the head of the coursework column rather than half the hero.
 * Sharing a band with the student's name gave it a fifth of the page to draw a
 * column per lesson in, which on a long course left them a few pixels wide;
 * and it put an exam result inside the block that identifies the student,
 * which is not what that block is for. Here it is the first thing under the
 * name, at the width of the table whose lesson numbers its ticks are read by.
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
          before: isWeak ? <span className="skill-chart__value">{skill.score}</span> : null,
          after: (
            <span className="skill-chart__tick">
              {lessonNumbers.get(skill.moduleId) ?? index + 1}
            </span>
          )
        };
      })
    : modules.map((module) => ({
        key: module.moduleId,
        score: 100,
        barClass: "skill-chart__bar--waiting",
        after: <span className="skill-chart__tick">{module.n}</span>
      }));

  let caption = "Not taken yet";
  if (taken && weak.length === 0) {
    caption = `Every topic at or above the ${threshold}% pass mark.`;
  } else if (taken) {
    caption = `${weak.length} of ${skills.length} topics below ${threshold}% — weakest is ${weakest.topic} at ${weakest.score}%.`;
  }

  return (
    <section className="assessor-card skill-card">
      <header className="card-head">
        <h2 className="assessor-card-title">Performance — final exam</h2>
        {taken ? (
          <span className="skill-chart__score">{skillGap.performance}%</span>
        ) : (
          <span className="skill-chart__score skill-chart__score--waiting">—</span>
        )}
      </header>

      <ColumnPlot
        prefix="skill-chart"
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

      <p className="skill-card__caption assessor-meta">{caption}</p>
    </section>
  );
}

function credentialMeta(credential) {
  if (credential.status !== "issued") return "Awaiting release";

  const date = formatDate(credential.issuedAt, { year: false });
  return date ? `Issued ${date}` : "Issued";
}

/**
 * The line under the final's title.
 *
 * The final is the only paper with a ceiling on how often it may be taken, so
 * a taken one says how much of that is left — the one fact about the final
 * that the results register does not carry. An untaken one says what it is
 * waiting on, and "not posted" is the assessor's own doing rather than the
 * student's — those are different facts and the row should not report both as
 * "not taken".
 */
function finalNote(final) {
  if (final.state !== "done") return final.posted ? "Not taken" : "Not posted yet";

  const used = Number(final.attemptsUsed ?? final.attempt ?? 1);
  const left = Math.max(0, Number(final.attemptsAllowed ?? 0) - used);

  if (left === 0) return "No attempts left";
  return `${left} attempt${left === 1 ? "" : "s"} left`;
}

/**
 * What became of a paper, in the three states the record actually holds.
 *
 * Not passed is its own state rather than a shade of taken: it is what a row
 * sitting half done is explained by, and it is the one an assessor is looking
 * for. What it scored is the register's to say.
 */
const QUIZ = {
  passed: { label: "Passed", tone: "success" },
  failed: { label: "Not passed", tone: "danger" },
  none: { label: "Not taken", tone: "outline" }
};

const quizState = (row) =>
  row.state !== "done" ? QUIZ.none : row.passed ? QUIZ.passed : QUIZ.failed;

/**
 * The three columns a row answers: how far through it the student is, when
 * they read the lesson, and what became of its quiz.
 *
 * The bar is the course figure's own arithmetic, one row's worth of it: a
 * lesson is two of the items that figure counts, reading it and passing its
 * quiz, and the final is one. So the bars down the table add up to the bar in
 * the hero rather than offering a second opinion about it.
 *
 * One component because the final's row asks the same three questions of a
 * different paper, and a column formatted differently on one of them would
 * read as a difference in the data. The final has no lesson to read, which is
 * the only thing it answers differently.
 */
function LessonCells({ row, lesson = true }) {
  const items = lesson ? 2 : 1;
  const done = (lesson && row.read ? 1 : 0) + (row.passed ? 1 : 0);
  const readOn = lesson ? formatDate(row.readAt) : null;
  const quiz = quizState(row);

  return (
    <>
      <td className="assessor-table__progress-cell">
        <ProgressBar label={`${done} of ${items}`} pct={Math.round((done / items) * 100)} />
      </td>

      {/* The day the lesson was finished. Nothing records the moment one is
          opened — how far into a lesson a reader has got stays in their own
          browser — so this is the last of it this side knows. */}
      <td className="assessor-table__when">
        {readOn ?? <span className="assessor-table__dash">—</span>}
      </td>

      <td>
        <Chip tone={quiz.tone}>{quiz.label}</Chip>
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
  // Absent from a server that predates the course figure; an empty course has
  // nothing to be part-way through either, and both read as no bar.
  const progress = detail.progress ?? { completedItems: 0, itemCount: 0, percent: 0 };
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

          {/* The figure the student is shown on their own course card, not a
              second opinion about it: the lessons, a quiz for each of them, and
              the final. An assessor asking "how far along are they" and the
              student reading the same course were being given different
              answers, because this screen had only the papers to count.

              It stands at the far end of the band rather than under the name:
              the hero holds two things now, who the student is and how far
              through they are, and one at each end says so without a heading.
              It is the only figure here, so it takes a label. */}
          {progress.itemCount > 0 ? (
            <div className="student-hero__progress">
              <span className="metric__label">Course progress</span>
              <ProgressBar
                label={`${progress.completedItems} of ${progress.itemCount}`}
                pct={progress.percent}
              />
            </div>
          ) : null}
        </section>

        <div className="student-split">
          <div className="assessor-stack">
            {/* The exam first, then the lessons it was drawn from: an assessor
                opens this page to find out where a student is weak, and the
                answer is one card rather than a table to read down. The ticks
                under the columns are the lesson numbers in the table below. */}
            <PerformanceChart
              skillGap={skillGap}
              modules={modules}
              lessonNumbers={lessonNumbers}
            />

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
                      Every lesson in this course, how far through it the student
                      is, the day they read it and what became of its quiz. What a
                      paper scored and how long it took are on the results screen.
                    </caption>

                    <thead>
                      <tr>
                        <th scope="col">Lesson</th>
                        <th scope="col">Progress</th>
                        <th scope="col">Lesson read</th>
                        <th scope="col">Quiz</th>
                      </tr>
                    </thead>

                    <tbody>
                      {modules.map((module) => (
                        <tr key={module.moduleId}>
                          <th scope="row">
                            <span className="module-cell">
                              <span
                                className={`module-row__num${
                                  module.state === "locked" ? " is-locked" : ""
                                }`}
                              >
                                {module.n}
                              </span>
                              <span className="assessor-table__name">{module.title}</span>
                            </span>
                          </th>

                          <LessonCells row={module} />
                        </tr>
                      ))}
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
                                <span className="assessor-table__sub">{finalNote(final)}</span>
                              </span>
                            </span>
                          </th>

                          <LessonCells row={final} lesson={false} />
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              )}
            </section>
          </div>

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
