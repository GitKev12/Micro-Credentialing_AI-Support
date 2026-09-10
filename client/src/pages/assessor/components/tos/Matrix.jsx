import { GROUPS, LEVELS, columnTotals, splitItems, toCount } from "./levels";

/**
 * Content against thinking level — the table the whole screen is building.
 *
 * The two panels above it each answer half a question: which lessons the
 * questions come from, and what kind of thinking they demand. Neither says
 * which lesson is being asked to carry the hard questions, and that is the
 * decision the blueprint exists to record. So this is the only place a cell
 * can be wrong in two directions at once, and both margins report
 * independently: a row against the lesson's share, a column against the
 * level's.
 *
 * Cells carry a wash of their column's colour in proportion to what is in
 * them, so the shape of a paper — recall spread thin across every lesson,
 * evaluation concentrated in two — can be read without adding the columns up.
 */
export default function Matrix({ lessons, rows, rowTargets, colTargets, onCell, disabled }) {
  const columns = columnTotals(rows);
  const grand = rows.reduce((sum, row) => sum + splitItems(row), 0);
  const wanted = lessons.reduce((sum, lesson) => sum + (rowTargets[lesson.id] ?? 0), 0);
  const busiest = Math.max(1, ...rows.flatMap((row) => LEVELS.map((level) => row[level.key] ?? 0)));

  const offClass = (actual, target) => (actual === target ? "" : " is-off");

  return (
    <div className="tos-matrix-scroll">
      <table className="tos-matrix">
        <caption className="assessor-sr-only">
          Questions per lesson and level of thinking, with the totals each row and
          column is aiming at.
        </caption>
        <thead>
          <tr>
            <th className="is-lesson" rowSpan={2} scope="col">
              Lesson
            </th>
            {GROUPS.map((group) => (
              <th key={group.key} colSpan={3} scope="colgroup" data-group={group.key}>
                {group.label}
              </th>
            ))}
            <th className="is-total" rowSpan={2} scope="col">
              Items
            </th>
          </tr>
          <tr>
            {LEVELS.map((level) => (
              <th key={level.key} scope="col" data-level={level.key} title={level.label}>
                {level.short}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {lessons.map((lesson, index) => {
            const row = rows[index] ?? {};
            const items = splitItems(row);
            const target = rowTargets[lesson.id] ?? 0;

            return (
              <tr key={lesson.id}>
                <th className="is-lesson" scope="row">
                  <span className="tos-matrix__n">{index + 1}</span>
                  {lesson.title}
                </th>
                {LEVELS.map((level) => {
                  const count = row[level.key] ?? 0;

                  return (
                    <td key={level.key} data-level={level.key}>
                      <span
                        className="tos-cell"
                        style={{ "--fill": count ? count / busiest : 0 }}
                      >
                        <input
                          className="tos-cell__field"
                          inputMode="numeric"
                          value={count}
                          disabled={disabled}
                          aria-label={`${level.label} questions from ${lesson.title}`}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) =>
                            onCell(index, level.key, toCount(event.target.value))
                          }
                        />
                      </span>
                    </td>
                  );
                })}
                <td className={`is-total${offClass(items, target)}`}>
                  <span className="tos-tally">
                    {items}
                    {items === target ? null : <em>of {target}</em>}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr>
            <th className="is-lesson" scope="row">
              Total
            </th>
            {LEVELS.map((level) => {
              const actual = columns[level.key];
              const target = colTargets[level.key] ?? 0;

              return (
                <td key={level.key} className={offClass(actual, target).trim()} data-level={level.key}>
                  <span className="tos-tally">
                    {actual}
                    {actual === target ? null : <em>of {target}</em>}
                  </span>
                </td>
              );
            })}
            <td className={`is-total${offClass(grand, wanted)}`}>
              <span className="tos-tally">
                {grand}
                {grand === wanted ? null : <em>of {wanted}</em>}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

