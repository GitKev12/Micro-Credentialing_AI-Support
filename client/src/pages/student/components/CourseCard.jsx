import { ScoreBarChart } from "../../../components/ScoreBarChart";
import { TARGET, bandFor, toScore } from "../performance";
import { BandChip, Meter } from "./ui";

/**
 * One course's performance, as a card.
 *
 * Three things, in the order a student reads them: which course this is (the
 * code, because that is what they call it), how they did overall, and the shape
 * behind that number — one column per topic, so a 72% that is evenly spread and
 * a 72% carried by two strong topics do not look identical.
 *
 * The column chart is deliberately small and unlabelled. Eight topic names will
 * not fit under a card-width plot, and a value on every column is the surest way
 * to make a chart go unread — so the columns carry shape and band, and the
 * exact figures live a click away in the course's own analysis (which has a
 * table view). Hover names any column.
 */

function TopicColumns({ skills, courseTitle, onOpen }) {
  const bars = skills.map((skill) => {
    const score = toScore(skill.score);
    const band = bandFor(score);

    return {
      label: "",
      score,
      color: band.id === "weak" ? "--sd-crit" : "--sd-good",
      tooltip: `${skill.topic} — ${score}% · ${band.label}`
    };
  });

  return (
    <>
      {/* The plot sits above the card's click overlay so a bar can be hovered,
          which costs it the overlay's click — so it carries the same action
          itself. Mouse-only by design: the overlay button behind it is still
          the one control keyboards and screen readers see, and the list under
          this one is what they are actually read. */}
      <ScoreBarChart
        className="sd-cc-chart"
        bars={bars}
        target={TARGET}
        height={74}
        axes={false}
        barWidth={22}
        lineColor="--sd-muted"
        lineOpacity={0.45}
        textColor="--sd-muted"
        surfaceColor="--sd-surface"
        onClick={onOpen}
      />

      {/* Google Charts paints to a canvas nothing can read, so the same
          figures are stated here for a screen reader. */}
      <ul className="sd-sr-only">
        {skills.map((skill, index) => {
          const score = toScore(skill.score);
          const band = bandFor(score);

          return (
            <li key={skill.moduleId ?? `${skill.topic}:${index}`}>
              {`${skill.topic} in ${courseTitle}: ${score} percent, ${band.label}`}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function CourseCard({ course, onOpen }) {
  const score = toScore(course.performance);
  const band = bandFor(score);
  const skills = course.skills ?? [];
  return (
    <li className="sd-cc" data-band={band.id}>
      <button
        type="button"
        className="sd-cc__open"
        onClick={onOpen}
        aria-label={`Open the full skill gap analysis for ${course.title}`}
      />

      <header className="sd-cc__head">
        <div className="sd-cc__id">
          <p className="sd-cc__code">{course.code || course.title}</p>
          {course.code ? <p className="sd-cc__title">{course.title}</p> : null}
        </div>
        <BandChip band={band} />
      </header>

      <div className="sd-cc__figure">
        <p className="sd-cc__label">Overall performance</p>
        <p className="sd-cc__value">
          {score}
          <small>%</small>
        </p>
      </div>

      <Meter
        value={score}
        band={band}
        label={`${course.title} overall performance: ${score} percent, ${band.label}`}
      />

      {skills.length > 0 ? (
        <>
          <p className="sd-cc__plot-label">
            {skills.length} {skills.length === 1 ? "topic" : "topics"}
          </p>

          <TopicColumns skills={skills} courseTitle={course.title} onOpen={onOpen} />
        </>
      ) : (
        <p className="sd-cc__note">
          Topic scores appear once this course&apos;s final exam is taken.
        </p>
      )}
    </li>
  );
}

export default CourseCard;
