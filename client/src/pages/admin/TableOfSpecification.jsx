import { useEffect, useState } from "react";
import {
  fetchTableOfSpecification,
  saveTableOfSpecification
} from "../../services/admin";
import { AdminButton, AdminSelect, PageHeader } from "./components/ui";
import BlueprintSummary from "./components/tos/BlueprintSummary";
import BlueprintTable from "./components/tos/BlueprintTable";
import { blueprintKey, blueprintTotals, EMPTY_ROW } from "./components/tos/blueprint";
import { SkeletonTable } from "../../components/Skeleton";

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

  const selected = blueprints.find((entry) => blueprintKey(entry) === selectedId) ?? null;

  useEffect(() => {
    let active = true;

    fetchTableOfSpecification()
      .then((list) => {
        if (!active) return;
        setBlueprints(list);
        const first = list[0] ?? null;
        setSelectedId(first ? blueprintKey(first) : null);
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

  const selectCourse = (key) => {
    if (key === selectedId) return;

    // Keep the edits made to the blueprint being left, so a switch is not a loss.
    setBlueprints((list) =>
      list.map((entry) =>
        blueprintKey(entry) === selectedId ? { ...entry, examination: exam, rows } : entry
      )
    );

    const next = blueprints.find((entry) => blueprintKey(entry) === key);
    setSelectedId(key);
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
    if (!selected?.courseId) return;

    setSaveState("saving");
    try {
      const list = await saveTableOfSpecification({
        courseId: selected.courseId,
        examination: exam,
        rows
      });
      setBlueprints(list);

      const saved = list.find((entry) => blueprintKey(entry) === selectedId);
      setExam(saved?.examination ?? "");
      setRows(saved?.rows ?? []);
      setSaveState("saved");
    } catch (_error) {
      setSaveState("error");
    }
  };

  const { totalHours, grandTotal, itemsPerQuiz } = blueprintTotals(rows);

  const saveLabel = {
    idle: "Save Blueprint",
    saving: "Saving…",
    saved: "Saved ✓",
    error: "Retry Save"
  }[saveState];

  if (status === "loading") {
    return (
      <div className="admin-main__inner admin-main__inner--wide">
        <PageHeader title="Table of Specification" />
        <SkeletonTable rows={5} cols={8} label="Loading blueprint…" />
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
      <PageHeader title="Table of Specification" />

      {/* Each course keeps its own blueprint, so the table below shows one at
          a time and the save applies only to the blueprint chosen here.

          This was a horizontal strip of tabs. One tab per course meant the
          strip grew with the catalog until it scrolled sideways, and a
          side-scrolling tab row hides exactly what you are looking for: the
          course that is off-screen. A dropdown is a fixed size whatever the
          catalog does, and it has room to say how full each blueprint is —
          which is the thing that decides where the work is. */}
      <div className="admin-toolbar">
        <div className="admin-toolbar__filter admin-toolbar__filter--wide">
          <AdminSelect
            value={selectedId}
            onChange={selectCourse}
            label="Blueprint to edit"
            placeholder={blueprints.length === 0 ? "No blueprints yet" : "Choose a blueprint…"}
            disabled={blueprints.length === 0}
            options={blueprints.map((entry) => ({
              value: blueprintKey(entry),
              label: entry.examination || entry.courseCode || "Untitled blueprint",
              meta: [
                entry.courseCode || "No code",
                entry.rows.length === 0
                  ? "empty"
                  : `${entry.rows.length} ${entry.rows.length === 1 ? "row" : "rows"}`
              ].join(" · ")
            }))}
          />
        </div>

        <span className="admin-tos-count">
          {blueprints.length} {blueprints.length === 1 ? "blueprint" : "blueprints"}
        </span>

        <AdminButton
          variant="admin-toolbar__action"
          onClick={save}
          disabled={saveState === "saving" || !selected?.courseId}
        >
          {saveLabel}
        </AdminButton>
      </div>

      <div className="admin-tos-card">
        <BlueprintSummary
          courseCode={selected?.courseCode}
          lessons={rows.length}
          exam={exam}
          onExamChange={(value) => {
            setSaveState("idle");
            setExam(value);
          }}
          grandTotal={grandTotal}
          itemsPerQuiz={itemsPerQuiz}
          totalHours={totalHours}
        />

        <BlueprintTable
          rows={rows}
          totalHours={totalHours}
          grandTotal={grandTotal}
          onCellChange={updateCell}
          onRemoveRow={removeRow}
        />

        <div className="admin-tos-foot">
          <button type="button" className="admin-ghost-btn" onClick={addRow}>
            <span aria-hidden="true">+</span> Add Course Row
          </button>
          {saveState === "error" ? (
            <span className="admin-tos-hint">Couldn't save — check the API and try again.</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default TableOfSpecification;
