
/** How far through a course, as a figure and the bar that shows it. */
function ProgressCell({ progress }) {
  const total = progress?.total ?? 0;
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
        aria-label={`Lessons finished: ${detail}`}
      >
        <div className="admin-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default ProgressCell;
