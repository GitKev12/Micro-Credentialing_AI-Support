import { ColumnPlot } from "../../../components/ColumnPlot";
import { TARGET, tierBandFor, tierBandForScore, toScore } from "../performance";
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

function TopicColumns({ skills, courseTitle, cutoff, onOpen }) {
  const grown = useGrown();

  // The whole slot is the hover target, not the bar — a 14% column is 8px of
  // hittable height on its own, so the tooltip hangs off the column.
  const columns = skills.map((skill, index) => {
    const score = toScore(skill.score);
    // The same four tiers the course's own analysis draws, against the same
    // class cut-off — a column and the bar it opens must not disagree.
    const band = tierBandFor(skill, cutoff);

    return {
      key: skill.moduleId ?? `${skill.topic}:${index}`,
      score,
      band: band.id,
      after: (
        <>
          <span className="sd-tip" role="tooltip">
            <strong>{skill.topic}</strong>
            {score}% · <span className="sd-tip__band">{band.label}</span>
          </span>
          <span className="sd-sr-only">
            {`${skill.topic} in ${courseTitle}: ${score} percent, ${band.label}`}
          </span>
        </>
      )
    };
  });

  return (
    // The plot sits above the card's click overlay so the columns can be
    // hovered, which costs it the overlay's click — so it carries the same
    // action itself. Mouse-only by design: the overlay button behind it is
    // still the one control keyboards and screen readers see.
    //
    // The target competency rides across the plot as the same recessive
    // hairline the meters use, at whatever this class's assessor set it to.
    <ColumnPlot
      prefix="sd-cc-chart"
      columns={columns}
      target={cutoff}
      grown={grown}
      as="ul"
      item="li"
      role="presentation"
      onClick={onOpen}
    />
  );
}

function CourseCard({ course, onOpen }) {
  const score = toScore(course.performance);
  const cutoff = course.cutoff ?? TARGET;
  const band = tierBandForScore(score, cutoff, course.tiers);
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
        target={cutoff}
        label={`${course.title} overall performance: ${score} percent, ${band.label}`}
      />

      {skills.length > 0 ? (
        <>
          <p className="sd-cc__plot-label">
            {skills.length} {skills.length === 1 ? "topic" : "topics"}
          </p>

          <TopicColumns
            skills={skills}
            courseTitle={course.title}
            cutoff={cutoff}
            onOpen={onOpen}
          />
        </>
      ) : (
        <p className="sd-cc__note">No topic scores yet.</p>
      )}
    </li>
  );
}

export default CourseCard;
