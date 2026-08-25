import { TARGET, bandFor, toScore } from "../performance";
import { BandChip, Meter, useGrown } from "./ui";

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

/** Columns are capped so a course with three topics does not draw three slabs. */
const COLUMN_MAX = 22;

function TopicColumns({ skills, courseTitle, onOpen }) {
  const grown = useGrown();

  return (
    // The plot sits above the card's click overlay so the columns can be
    // hovered, which costs it the overlay's click — so it carries the same
    // action itself. Mouse-only by design: the overlay button behind it is
    // still the one control keyboards and screen readers see.
    <div className="sd-cc-chart" onClick={onOpen} role="presentation">
      {/* The passing mark, drawn across the plot as the same recessive hairline
          the meters use. Solid, not dashed — it is a threshold, and the legend
          below names it rather than leaving the reader to guess. */}
      <span
        className="sd-cc-chart__target"
        style={{ bottom: `${TARGET}%` }}
        aria-hidden="true"
      />

      <ul className="sd-cc-chart__plot">
        {skills.map((skill, index) => {
          const score = toScore(skill.score);
          const band = bandFor(score);

          return (
            <li
              className="sd-cc-col"
              key={skill.moduleId ?? `${skill.topic}:${index}`}
              data-band={band.id}
              style={{ maxWidth: `${COLUMN_MAX}px` }}
            >
              {/* The whole slot is the hover target, not the column — a 14%
                  column is 8px of hittable height on its own. */}
              <span
                className="sd-cc-col__bar"
                style={{ height: `${grown ? score : 0}%` }}
                aria-hidden="true"
              />
              <span className="sd-tip" role="tooltip">
                <strong>{skill.topic}</strong>
                {score}% · <span className="sd-tip__band">{band.label}</span>
              </span>
              <span className="sd-sr-only">
                {`${skill.topic} in ${courseTitle}: ${score} percent, ${band.label}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
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
          Topic scores appear once this course&apos;s final exam is sat.
        </p>
      )}
    </li>
  );
}

export default CourseCard;
