import { useId } from "react";

/**
 * Tag-style multi-select: pick many from a dropdown, each shown as a removable
 * chip. Built on top of `AdminSelect` rather than beside it — the dropdown is
 * one AdminSelect whose options are only the values not yet chosen, so it keeps
 * the same listbox, keyboard model and rich two-line rows for free. Choosing an
 * option adds a chip and drops it from the list; the trigger always shows its
 * placeholder because it holds no single "value".
 *
 * `values` is an array of chosen option values; `options` are { value, label,
 * meta? }, the same shape AdminSelect takes.
 */
export function AdminField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
  disabled = false,
  required = false,
  autoComplete = "off",
  multiline = false,
  rows = 4
}) {
  const id = useId();

  // Same field, two shapes: anything paragraph-length gets a box it can be
  // read back in while it is being written, rather than a one-line slot that
  // scrolls its own beginning out of sight.
  const Control = multiline ? "textarea" : "input";

  return (
    <div className="admin-field">
      <label className="admin-field__label" htmlFor={id}>
        {label}
        {required ? <span className="admin-field__required"> *</span> : null}
      </label>
      <Control
        id={id}
        className={`admin-input${multiline ? " admin-input--multiline" : ""}`}
        {...(multiline ? { rows } : { type })}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="admin-field__hint">{hint}</p> : null}
    </div>
  );
}
