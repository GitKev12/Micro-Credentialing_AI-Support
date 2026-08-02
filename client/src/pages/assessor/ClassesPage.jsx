import { useNavigate } from "react-router-dom";
import data from "./assessorSampleData.json";
import { ChevronRightIcon } from "./components/icons";
import { Chip, ScreenHeader, StatCard } from "./components/ui";

function ClassesPage() {
  const navigate = useNavigate();
  const { summary, classes, copy } = data;

  return (
    <>
      <ScreenHeader eyebrow="Assessor console" title="Classes" />

      <div className="assessor-body assessor-stack">
        <div className="stat-row">
          <StatCard
            value={summary.toGrade}
            label="To Grade"
            action="Open Queue"
            onAction={() => navigate("/assessor/queue")}
          />
          <StatCard
            value={summary.aiFlagged}
            label="AI Flagged"
            action="Review Flagged"
            onAction={() => navigate("/assessor/queue?filter=flagged")}
          />
          <StatCard
            value={summary.credentials}
            label="Credentials"
            action="Approve & Issue"
            onAction={() => navigate("/assessor/credentials")}
          />

          <section className="explainer">
            <h2 className="explainer__title">{copy.howGradingWorks.title}</h2>
            <p className="explainer__body">{copy.howGradingWorks.body}</p>
            <div className="explainer__tags">
              <Chip tone="info" dot>
                {copy.howGradingWorks.tags[0]}
              </Chip>
              <Chip tone="brand-soft" dot>
                {copy.howGradingWorks.tags[1]}
              </Chip>
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
                  {course.code} · {course.section}
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
        </section>
      </div>
    </>
  );
}

export default ClassesPage;
