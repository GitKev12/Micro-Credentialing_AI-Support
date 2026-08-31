import { TrashIcon } from "../icons";
import { LEVELS, rowItems, toNumber } from "./blueprint";

/**
 * The blueprint itself — one row per lesson, a column per Bloom level.
 *
 * Every cell is an input, so this is the part of the screen that changes on
 * each keystroke. Keeping it apart from the page means the page's own state
 * and effects are readable without scrolling past ninety lines of table.
 */
export default function BlueprintTable({
  rows,
  totalHours,
  grandTotal,
  onCellChange,
  onRemoveRow
}) {
  return (
    <div className="admin-tos-scroll">
      <table className="admin-tos-table">
        <thead>
          <tr>
            {/* One row per lesson of the selected course. The coverage
                label is editable; the lesson it points at is held in the
                row's moduleId, which renaming must not disturb. */}
            <th className="is-course">Coverage</th>
            <th>Hours</th>
            <th>% Weight</th>
            {LEVELS.map((level) => (
              <th key={level.key}>{level.label}</th>
            ))}
            <th className="is-items">Items</th>
            <th className="is-items" aria-label="Remove row" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td className="is-course">
                <input
                  className="tos-cell"
                  style={{ fontWeight: 500 }}
                  value={row.course}
                  aria-label={`Coverage topic, row ${index + 1}`}
                  onChange={(event) => onCellChange(index, "course", event.target.value)}
                />
              </td>
              <td>
                <input
                  className="tos-cell tos-num"
                  inputMode="numeric"
                  value={row.hours}
                  aria-label={`Contact hours, row ${index + 1}`}
                  onChange={(event) =>
                    onCellChange(index, "hours", toNumber(event.target.value))
                  }
                />
              </td>
              <td className="is-weight">
                {totalHours ? Math.round(((row.hours || 0) / totalHours) * 100) : 0}%
              </td>
              {LEVELS.map((level) => (
                <td key={level.key}>
                  <input
                    className="tos-cell tos-num"
                    inputMode="numeric"
                    value={row[level.key]}
                    aria-label={`${level.label}, row ${index + 1}`}
                    onChange={(event) =>
                      onCellChange(index, level.key, toNumber(event.target.value))
                    }
                  />
                </td>
              ))}
              <td className="is-items">{rowItems(row)}</td>
              <td style={{ textAlign: "center" }}>
                <button
                  type="button"
                  className="admin-icon-btn"
                  onClick={() => onRemoveRow(index)}
                  aria-label={`Remove row ${index + 1}`}
                >
                  <TrashIcon size={14} />
                </button>
              </td>
            </tr>
          ))}

          {rows.length === 0 ? (
            <tr>
              <td colSpan={LEVELS.length + 5} style={{ textAlign: "center", padding: 24 }}>
                <span className="admin-empty-note">No blueprint saved yet.</span>
              </td>
            </tr>
          ) : (
            <tr className="admin-tos-total">
              <td className="is-label">TOTAL</td>
              <td>{totalHours}</td>
              <td>100%</td>
              {LEVELS.map((level) => (
                <td key={level.key}>
                  {rows.reduce((sum, row) => sum + (row[level.key] || 0), 0)}
                </td>
              ))}
              <td className="is-grand">{grandTotal}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
