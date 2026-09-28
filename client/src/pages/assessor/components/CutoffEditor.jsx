import { useState } from "react";
import { PencilIcon } from "./icons";

// A whole number from 1 to 99, or null. Same rule as the server.
const readCutoff = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 99 ? number : null;
};

/**
 * The skill gap cut-off of each of this assessor's classes on the course.
 * A button shows the value; pressing it opens a small form to change it.
 * onSave(classId, cutoff) saves one class and returns a promise.
 */
function CutoffEditor({ classes, onSave }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  if (classes.length === 0) return null;

  // Fill the form with the saved values each time it opens.
  const toggle = () => {
    if (!open) setValues(Object.fromEntries(classes.map((cls) => [cls.id, String(cls.cutoff)])));
    setOpen(!open);
  };

  const invalid = classes.some((cls) => readCutoff(values[cls.id]) === null);

  const save = async (event) => {
    event.preventDefault();
    if (invalid) return;

    setSaving(true);
    try {
      // Only the classes whose value changed.
      for (const cls of classes) {
        const cutoff = readCutoff(values[cls.id]);
        if (cutoff !== cls.cutoff) await onSave(cls.id, cutoff);
      }
      setOpen(false);
    } catch {
      // The page shows the error; keep the form open to try again.
    } finally {
      setSaving(false);
    }
  };

  // One class: the button shows its value. Several: each shows in the form.
  const label = classes.length === 1 ? `Cut-off ${classes[0].cutoff}%` : "Cut-off";

  return (
    <div className="assessor-cutoff">
      <button
        type="button"
        className="assessor-cutoff__button"
        aria-expanded={open}
        onClick={toggle}
      >
        {label}
        <PencilIcon size={14} />
      </button>

      {open ? (
        <form
          className="assessor-cutoff__panel"
          onSubmit={save}
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        >
          {classes.map((cls) => (
            <label className="assessor-cutoff__field" key={cls.id}>
              <span className="assessor-cutoff__name">{cls.name}</span>
              <span className="assessor-cutoff__input">
                <input
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  value={values[cls.id] ?? ""}
                  disabled={saving}
                  aria-invalid={readCutoff(values[cls.id]) === null}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [cls.id]: event.target.value }))
                  }
                />
                %
              </span>
            </label>
          ))}

          {invalid ? <p className="assessor-cutoff__error">Use a whole number from 1 to 99.</p> : null}

          <div className="assessor-cutoff__actions">
            <button type="button" className="assessor-cutoff__cancel" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="assessor-cutoff__save" disabled={saving || invalid}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export default CutoffEditor;
