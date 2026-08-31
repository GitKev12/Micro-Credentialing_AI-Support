/**
 * The column plot both consoles draw.
 *
 * A student's course card and an assessor's student page show the same
 * picture — one column per topic, each scored out of 100, read against a
 * threshold hairline — in two skins that share no colours and no type. What
 * they do share is the geometry, and geometry is where the bugs are: clamping
 * a score that arrives outside 0–100, turning it into a height, and putting
 * the threshold at the offset the columns are actually measured against. That
 * was written twice, and only one of the two copies clamped.
 *
 * So this owns the frame and the arithmetic, and nothing about the look. The
 * caller hands over its own class prefix — every class is derived from it, so
 * each side keeps its stylesheet exactly as it was — and hangs whatever else
 * it needs on a column through `before` and `after`: a lesson number under
 * one, a hover tooltip on another.
 */

/** Out-of-range scores are the caller's business, but they cannot be drawn. */
const clampScore = (value) => {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
};

/**
 * @param prefix      Class stem: `${prefix}`, `__plot`, `__target`, `__col`, `__bar`.
 * @param columns     One per bar: { key, score, band?, title?, barClass?, before?, after? }.
 * @param target      Threshold to draw the hairline at, or null for no line.
 * @param targetLabel Text riding on that line. Omitted where a legend names it instead.
 * @param grown       False holds every bar at zero height, so CSS can grow them in.
 * @param as / item   Element for the column list and for one column.
 */
export function ColumnPlot({
  prefix,
  columns,
  target = null,
  targetLabel = null,
  grown = true,
  as: List = "div",
  item: Item = "div",
  role,
  ariaLabel,
  onClick
}) {
  return (
    // The box is the positioning context the hairline is placed against, and
    // it carries the whole plot's role — the columns inside are decoration
    // once a caller has described the picture.
    <div className={prefix} role={role} aria-label={ariaLabel} onClick={onClick}>
      {target === null ? null : (
        <span
          className={`${prefix}__target`}
          style={{ bottom: `${clampScore(target)}%` }}
          aria-hidden="true"
        >
          {targetLabel ? <span>{targetLabel}</span> : null}
        </span>
      )}

      <List className={`${prefix}__plot`}>
        {columns.map((column) => (
          <Item
            key={column.key}
            className={`${prefix}__col`}
            data-band={column.band}
            title={column.title}
          >
            {column.before}
            <span
              className={`${prefix}__bar${column.barClass ? ` ${column.barClass}` : ""}`}
              style={{ height: `${grown ? clampScore(column.score) : 0}%` }}
              aria-hidden="true"
            />
            {column.after}
          </Item>
        ))}
      </List>
    </div>
  );
}

export default ColumnPlot;
