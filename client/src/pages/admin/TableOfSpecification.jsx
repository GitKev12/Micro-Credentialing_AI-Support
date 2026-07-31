import { useEffect, useState } from "react";
import {
  fetchTableOfSpecification,
  saveTableOfSpecification
} from "../../services/admin";
import { TrashIcon } from "./components/icons";
import { AdminButton, PageHeader } from "./components/ui";

// Bloom's taxonomy columns, in the order the blueprint lists them.
const LEVELS = [
  { key: "remember", label: "Remembering" },
  { key: "understand", label: "Understanding" },
  { key: "apply", label: "Applying" },
  { key: "analyze", label: "Analyzing" },
  { key: "evaluate", label: "Evaluating" },
  { key: "create", label: "Creating" }
];

const EMPTY_ROW = {
  course: "",
  hours: 0,
  remember: 0,
  understand: 0,
  apply: 0,
  analyze: 0,
  evaluate: 0,
  create: 0
};

function toNumber(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function TableOfSpecification() {
  const [exam, setExam] = useState("");
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");
  const [saveState, setSaveState] = useState("idle");

  useEffect(() => {
    let active = true;

    fetchTableOfSpecification()
      .then((blueprint) => {
        if (!active) return;
        setExam(blueprint.examination ?? "");
        setRows(blueprint.rows ?? []);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const updateCell = (index, key, value) => {
    setSaveState("idle");
    setRows((list) => list.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const removeRow = (index) => {
    setSaveState("idle");
    setRows((list) => list.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setSaveState("idle");
    setRows((list) => [...list, { ...EMPTY_ROW }]);
  };

  const save = async () => {
    setSaveState("saving");
    try {
      const blueprint = await saveTableOfSpecification({ examination: exam, rows });
      setExam(blueprint.examination ?? "");
      setRows(blueprint.rows ?? []);
      setSaveState("saved");
    } catch (_error) {
      setSaveState("error");
    }
  };

  const rowItems = (row) => LEVELS.reduce((sum, level) => sum + (row[level.key] || 0), 0);
  const totalHours = rows.reduce((sum, row) => sum + (row.hours || 0), 0);
  const grandTotal = rows.reduce((sum, row) => sum + rowItems(row), 0);

  const saveLabel = {
    idle: "Save Blueprint",
    saving: "Saving…",
    saved: "Saved ✓",
    error: "Retry Save"
  }[saveState];

  if (status === "loading") {
    return (
      <div className="admin-main__inner admin-main__inner--wide">
        <PageHeader title="Table of Specification" subtitle="Loading blueprint…" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="admin-main__inner admin-main__inner--wide">
        <PageHeader
          title="Table of Specification"
          subtitle="Couldn't reach the API. Check that the server is running."
        />
      </div>
    );
  }

  return (
    <div className="admin-main__inner admin-main__inner--wide">
      <PageHeader
        title="Table of Specification"
        subtitle="One assessment blueprint covering all available courses"
        action={
          <AdminButton onClick={save} disabled={saveState === "saving"}>
            {saveLabel}
          </AdminButton>
        }
      />

      <div className="admin-tos-card">
        <div className="admin-tos-summary">
          <div>
            <div className="admin-tos-summary__label">Scope</div>
            <div className="admin-tos-summary__value">All Courses · {rows.length}</div>
          </div>
          <div>
            <div className="admin-tos-summary__label">Examination</div>
            <input
              className="admin-tos-summary__input"
              value={exam}
              aria-label="Examination name"
              onChange={(event) => {
                setSaveState("idle");
                setExam(event.target.value);
              }}
            />
          </div>
          <div>
            <div className="admin-tos-summary__label">Total Items</div>
            <div className="admin-tos-summary__value admin-tos-summary__value--brand">
              {grandTotal}
            </div>
          </div>
          <div>
            <div className="admin-tos-summary__label">Contact Hours</div>
            <div className="admin-tos-summary__value admin-tos-summary__value--brand">
              {totalHours}
            </div>
          </div>
        </div>

        <div className="admin-tos-scroll">
          <table className="admin-tos-table">
            <thead>
              <tr>
                <th className="is-course">Course</th>
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
                      aria-label={`Course name, row ${index + 1}`}
                      onChange={(event) => updateCell(index, "course", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="tos-cell tos-num"
                      inputMode="numeric"
                      value={row.hours}
                      aria-label={`Contact hours, row ${index + 1}`}
                      onChange={(event) =>
                        updateCell(index, "hours", toNumber(event.target.value))
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
                          updateCell(index, level.key, toNumber(event.target.value))
                        }
                      />
                    </td>
                  ))}
                  <td className="is-items">{rowItems(row)}</td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      className="admin-icon-btn"
                      onClick={() => removeRow(index)}
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
                    <span className="admin-empty-note">
                      No blueprint saved yet. Add a course row, or seed the collection with
                      <code> npm run seed:tos</code>.
                    </span>
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

        <div className="admin-tos-foot">
          <button type="button" className="admin-ghost-btn" onClick={addRow}>
            <span aria-hidden="true">+</span> Add Course Row
          </button>
          <span className="admin-tos-hint">
            {saveState === "error"
              ? "Couldn't save — check the API and try again."
              : "Click any cell to edit — totals update automatically"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default TableOfSpecification;
