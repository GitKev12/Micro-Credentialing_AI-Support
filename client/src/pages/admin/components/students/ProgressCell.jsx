/**
 * How far through a course, as a figure and the bar that shows it.
 *
 * The course, not the reading: its lessons, a quiz for each of them and the
 * final, which is the sum the student is shown on their own course card. It
 * counted finished lessons alone, so a student who had read everything and
 * taken nothing filled this bar — and the credential line above it, which
 * reads a full bar as a course earned, believed it.
 *
 * The lesson figures are the fallback rather than the answer: they are all a
 * server from before this change sends.
 */
function ProgressCell({ progress }) {
  const total = progress?.total ?? progress?.lessonsTotal ?? 0;
  if (total === 0) {
    return <span className="admin-count admin-count--none">No lessons yet</span>;
  }

  const pct = Math.max(0, Math.min(100, progress.pct ?? 0));
  const detail = `${progress.completed} of ${total} · ${pct}%`;

  return (
    <div className="admin-cell-progress">
      <span className="admin-cell-progress__figure">{detail}</span>
      <div
        className="admin-progress__track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Course progress: ${detail}`}
      >
        <div className="admin-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default ProgressCell;
