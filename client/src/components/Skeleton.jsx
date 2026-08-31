/**
 * The shapes the app shows while it is waiting.
 *
 * A skeleton instead of a spinner because it answers a different question. A
 * spinner says "something is happening"; a skeleton says "a table of six rows
 * is about to appear here", so the page does not jump when it does and the eye
 * is already in the right place.
 *
 * Everything is drawn from --skel-bg and --skel-shine, which are defined once
 * per theme in styles.css, so these need no per-console variant.
 *
 * Each block is aria-hidden and the wrapper carries the live region: the shapes
 * mean nothing read aloud, and the label says what is coming instead.
 */

/** One bar. `w` and `h` take any CSS length; `circle` makes it a disc. */
export function Skeleton({ w = "100%", h = 12, circle = false, className = "" }) {
  return (
    <span
      className={`skel${circle ? " skel--circle" : ""}${className ? ` ${className}` : ""}`}
      style={{ width: circle ? h : w, height: h }}
    />
  );
}

/**
 * A paragraph's worth of bars. The last one is short, because a real last line
 * is — a stack of identical full-width bars reads as a barcode, not as text.
 */
export function SkeletonText({ lines = 3, width = "100%", label }) {
  const bars = (
    <span className="skel-text" style={{ width }} aria-hidden={label ? "true" : undefined}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} w={index === lines - 1 ? "62%" : "100%"} h={12} />
      ))}
    </span>
  );

  // Given a label it stands on its own as a loading state and needs to say so;
  // without one it is a piece of a larger skeleton that already has.
  if (!label) return bars;

  return (
    <span className="skel-block" role="status" aria-live="polite">
      <span className="admin-visually-hidden">{label}</span>
      {bars}
    </span>
  );
}

/**
 * A list screen, mid-load.
 *
 * Built as a real `.admin-table` inside a real `.admin-table-card` rather than
 * as a stack of bars: the row height, the cell padding and the header tint then
 * come from the same rules the loaded table uses, so the skeleton and the
 * content it becomes are the same size to the pixel and nothing shifts.
 */
export function SkeletonTable({ rows = 6, cols = 5, label = "Loading…" }) {
  return (
    <div className="admin-table-card" role="status" aria-live="polite">
      <span className="admin-visually-hidden">{label}</span>

      <table className="admin-table" aria-hidden="true">
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, col) => (
              <th key={col}>
                <Skeleton w={col === 0 ? "45%" : "60%"} h={9} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr className="admin-table__static" key={row}>
              {Array.from({ length: cols }, (_, col) => (
                <td key={col}>
                  {/* The first column of these tables is a mark beside a name,
                      so it is drawn as one rather than as another bar. */}
                  {col === 0 ? (
                    <span className="skel-person">
                      <Skeleton h={34} circle />
                      <span className="skel-person__lines">
                        <Skeleton w="70%" h={11} />
                        <Skeleton w="45%" h={9} />
                      </span>
                    </span>
                  ) : (
                    <Skeleton w={col === cols - 1 ? "40%" : "70%"} h={11} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A detail screen's identity block — the disc, the name and the line under it —
 * with an optional stack of blocks standing in for the cards below it.
 */
export function SkeletonDetail({ blocks = 2, label = "Loading…" }) {
  return (
    <div className="skel-detail" role="status" aria-live="polite">
      <span className="admin-visually-hidden">{label}</span>

      <span className="skel-detail__head" aria-hidden="true">
        <Skeleton h={64} circle />
        <span className="skel-detail__lines">
          <Skeleton w="38%" h={26} />
          <Skeleton w="26%" h={11} />
        </span>
      </span>

      <span className="skel-detail__blocks" aria-hidden="true">
        {Array.from({ length: blocks }, (_, index) => (
          <Skeleton key={index} h={index === 0 ? 92 : 132} />
        ))}
      </span>
    </div>
  );
}
