import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAssessorClasses, storedAssessorId } from "../../services/assessors";
import { ChevronRightIcon, GenerateIcon } from "./components/icons";
import { Chip, ScreenHeader } from "./components/ui";

/**
 * Generate Assessment — one card per class the assessor holds.
 *
 * The console's other lists are registers, read one row at a time. This one is
 * a set of cards because it is a set of decisions rather than a set of records:
 * each class is either owed papers or it is not, and that is the whole of what
 * the screen has to say before the assessor picks one and goes in.
 */

/** What a class is still waiting on, as the one line the card is built around. */
function state(course) {
  const expected = course.assessmentsExpected ?? 0;
  const posted = course.assessmentsPosted ?? 0;
  const written = course.assessmentsWritten ?? 0;
  const drafts = Math.max(0, written - posted);
  const missing = Math.max(0, expected - written);

  return { expected, posted, written, drafts, missing };
}

function ClassCard({ course, onOpen }) {
  const { expected, posted, drafts, missing } = state(course);
  const pct = expected > 0 ? Math.round((posted / expected) * 100) : 0;

  return (
    <button type="button" className="gen-card" onClick={onOpen}>
      <span className="gen-card__head">
        <span className="gen-card__code">
          {course.code}
          {course.section ? ` · ${course.section}` : ""}
        </span>
        <span className="gen-card__icon" aria-hidden="true">
          <GenerateIcon size={22} />
        </span>
      </span>

      <span className="gen-card__name">{course.name}</span>

      <span className="gen-card__count">
        {posted}
        <span className="gen-card__count-of"> / {expected} posted</span>
      </span>

      <span
        className="gen-card__track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${posted} of ${expected} papers posted`}
      >
        <span className="gen-card__fill" style={{ width: `${pct}%` }} />
      </span>

      <span className="gen-card__tags">
        {drafts > 0 ? (
          <Chip tone="brand-soft" dot>
            {drafts} draft{drafts === 1 ? "" : "s"} to review
          </Chip>
        ) : null}
        {missing > 0 ? (
          <Chip tone="outline">
            {missing} not written
          </Chip>
        ) : null}
        {drafts === 0 && missing === 0 ? <Chip tone="info">All papers posted</Chip> : null}
      </span>

      <span className="gen-card__foot">
        <span className="assessor-meta">
          {course.students} student{course.students === 1 ? "" : "s"} · {course.lessons} lesson
          {course.lessons === 1 ? "" : "s"}
        </span>
        <span className="gen-card__go">
          Open
          <ChevronRightIcon size={15} />
        </span>
      </span>
    </button>
  );
}

function GeneratePage() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const assessorId = storedAssessorId();
    if (!assessorId) {
      setIsLoading(false);
      return undefined;
    }

    fetchAssessorClasses(assessorId)
      .then((rows) => {
        if (active) setClasses(rows);
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
      <ScreenHeader eyebrow="Assessor console" title="Generate Assessment" />

      <div className="assessor-body assessor-stack">
        <div className="gen-grid">
          {classes.map((course) => (
            <ClassCard
              key={course.id}
              course={course}
              onOpen={() => navigate(`/assessor/generate/${course.id}`)}
            />
          ))}
        </div>

        {isLoading ? (
          <p className="assessor-meta" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
            Loading your classes…
          </p>
        ) : null}

        {!isLoading && classes.length === 0 ? (
          <p className="assessor-meta" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
            No classes are assigned to you yet.
          </p>
        ) : null}
      </div>
    </>
  );
}

export default GeneratePage;
