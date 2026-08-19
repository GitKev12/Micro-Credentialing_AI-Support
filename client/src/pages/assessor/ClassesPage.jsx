import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAssessorClasses,
  fetchAssessorOverview,
  storedAssessorId
} from "../../services/assessors";
import { ChevronRightIcon, CredentialIcon, FlagIcon, QueueIcon } from "./components/icons";
import { Chip, ScreenHeader, StatCard } from "./components/ui";

/**
 * Three steps, not a paragraph.
 *
 * This used to be four dense sentences naming the module PDF, the Table of
 * Specification and the token limit — none of which an assessor does anything
 * about. What they need to know is who marks first, what they can change, and
 * when the student actually gets the credential.
 */
const HOW_GRADING_WORKS = {
  title: "How grading works",
  steps: [
    "The AI writes each quiz from the lesson, then marks the answers.",
    "You review the marks. Keep them, change any answer, or set your own grade.",
    "The student gets the credential only after you approve it."
  ],
  note: "If the AI cannot mark a paper, it says so on the submission and you grade that one yourself.",
  tags: ["AI marks first", "You can override", "You approve"]
};

function ClassesPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({ toGrade: 0, aiFlagged: 0, credentials: 0 });
  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const assessorId = storedAssessorId();
    if (!assessorId) {
      setIsLoading(false);
      return undefined;
    }

    Promise.all([fetchAssessorOverview(assessorId), fetchAssessorClasses(assessorId)])
      .then(([overview, classList]) => {
        if (!active) return;
        setSummary(overview?.summary ?? { toGrade: 0, aiFlagged: 0, credentials: 0 });
        setClasses(classList);
      })
      .catch(() => {
        if (active) setClasses([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <ScreenHeader eyebrow="Assessor console" title="Classes" />

      <div className="assessor-body assessor-stack">
        <div className="stat-row">
          <StatCard
            value={summary.toGrade}
            label="To Grade"
            action="Open Queue"
            icon={<QueueIcon />}
            onAction={() => navigate("/assessor/queue")}
          />
          <StatCard
            value={summary.aiFlagged}
            label="AI Flagged"
            action="Review Flagged"
            icon={<FlagIcon />}
            onAction={() => navigate("/assessor/queue?filter=flagged")}
          />
          <StatCard
            value={summary.credentials}
            label="Credentials"
            action="Approve & Issue"
            icon={<CredentialIcon />}
            onAction={() => navigate("/assessor/credentials")}
          />

          <section className="explainer">
            <h2 className="explainer__title">{HOW_GRADING_WORKS.title}</h2>

            <ol className="explainer__steps">
              {HOW_GRADING_WORKS.steps.map((step, index) => (
                <li className="explainer__step" key={step}>
                  <span className="explainer__step-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <p className="explainer__note">{HOW_GRADING_WORKS.note}</p>

            <div className="explainer__tags">
              {HOW_GRADING_WORKS.tags.map((tag, index) => (
                <Chip key={tag} tone={index % 2 === 0 ? "info" : "brand-soft"} dot>
                  {tag}
                </Chip>
              ))}
            </div>
          </section>
        </div>

        <section className="assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
          <h2 className="assessor-h2" style={{ marginBottom: "var(--sp-2)" }}>
            Your Classes
          </h2>

          {classes.map((course) => (
            <button
              type="button"
              key={course.id}
              className="class-row"
              onClick={() => navigate(`/assessor/classes/${course.id}`)}
            >
              <span className="class-row__lead">
                <span className="class-row__code" style={{ display: "block" }}>
                  {course.code}
                  {course.section ? ` · ${course.section}` : ""}
                </span>
                <span className="class-row__name" style={{ display: "block" }}>
                  {course.name}
                </span>
              </span>

              <span className="class-row__rule" aria-hidden="true" />

              <span className="class-row__students">{course.students} Students</span>

              <Chip tone={course.pending > 4 ? "brand" : "outline"}>
                {course.pending} to grade
              </Chip>

              <span className="class-row__chevron">
                <ChevronRightIcon size={20} />
              </span>
            </button>
          ))}

          {!isLoading && classes.length === 0 ? (
            <p className="assessor-meta" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
              No classes are assigned to you yet.
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}

export default ClassesPage;
