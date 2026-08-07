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
  // One blueprint per course, edited one at a time. `rows` is the working copy
  // of the selected course's table; `blueprints` keeps the rest untouched so
  // switching away and back does not lose an unsaved edit.
  const [blueprints, setBlueprints] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [exam, setExam] = useState("");
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");
  const [saveState, setSaveState] = useState("idle");

  const selected = blueprints.find((entry) => entry.courseId === selectedId) ?? null;

  useEffect(() => {
    let active = true;

    fetchTableOfSpecification()
      .then((list) => {
        if (!active) return;
        setBlueprints(list);
        const first = list[0] ?? null;
        setSelectedId(first?.courseId ?? null);
        setExam(first?.examination ?? "");
        setRows(first?.rows ?? []);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const selectCourse = (courseId) => {
    // Keep the edits made to the course being left, so a switch is not a loss.
    setBlueprints((list) =>
      list.map((entry) =>
        entry.courseId === selectedId ? { ...entry, examination: exam, rows } : entry
      )
    );

    const next = blueprints.find((entry) => entry.courseId === courseId);
    setSelectedId(courseId);
    setExam(next?.examination ?? "");
    setRows(next?.rows ?? []);
    setSaveState("idle");
  };

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
    if (!selectedId) return;

    setSaveState("saving");
    try {
      const list = await saveTableOfSpecification({
        courseId: selectedId,
        examination: exam,
        rows
      });
      setBlueprints(list);

      const saved = list.find((entry) => entry.courseId === selectedId);
      setExam(saved?.examination ?? "");
      setRows(saved?.rows ?? []);
      setSaveState("saved");
    } catch (_error) {
      setSaveState("error");
    }
  };

  const rowItems = (row) => LEVELS.reduce((sum, level) => sum + (row[level.key] || 0), 0);
  const totalHours = rows.reduce((sum, row) => sum + (row.hours || 0), 0);
  const grandTotal = rows.reduce((sum, row) => sum + rowItems(row), 0);

  // Each row states one quiz's worth of items. When every row agrees, that is
  // the size of every generated quiz; when they differ there is no single
  // figure to show and generation follows each row instead.
  const perRowItems = rows.map(rowItems);
  const uniformItems =
    perRowItems.length > 0 && perRowItems.every((n) => n === perRowItems[0]);
  const itemsPerQuiz = uniformItems ? perRowItems[0] : null;

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
        subtitle="One assessment blueprint per course — its rows are that course's lessons"
        action={
          <AdminButton onClick={save} disabled={saveState === "saving" || !selectedId}>
            {saveLabel}
          </AdminButton>
        }
      />

      {/* Each course keeps its own blueprint, so the table below shows one at
          a time and the save applies only to the course selected here. */}
      <div className="admin-tos-courses" role="tablist" aria-label="Course blueprints">
        {blueprints.map((entry) => (
          <button
            key={entry.courseId ?? entry.id}
            type="button"
            role="tab"
            aria-selected={entry.courseId === selectedId}
            className={`admin-tos-course${entry.courseId === selectedId ? " is-active" : ""}`}
            onClick={() => selectCourse(entry.courseId)}
          >
            <span className="admin-tos-course__code">{entry.courseCode || "—"}</span>
            <span className="admin-tos-course__name">{entry.examination}</span>
          </button>
        ))}
      </div>

      <div className="admin-tos-card">
        <div className="admin-tos-summary">
          <div>
            <div className="admin-tos-summary__label">Course</div>
            <div className="admin-tos-summary__value">
              {selected?.courseCode || "—"} · {rows.length} lessons
            </div>
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
            <div className="admin-tos-summary__label">Items per Quiz</div>
            <div className="admin-tos-summary__value admin-tos-summary__value--brand">
              {itemsPerQuiz ?? "varies"}
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
                      No blueprint saved yet. Build one per course from the official spreadsheet
                      with
                      <code> node scripts/import-tos.mjs &lt;file.xlsx&gt; --all-courses --write</code>.
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
