import { useId } from "react";

import { LockIcon } from "../icons";

/**
 * A labelled text box for the admin forms: one line, or a paragraph box with
 * `multiline`. Shows the rule the value breaks (`error`) or else the `hint`.
 * `maxLength` stops typing at the same limit the server checks.
 */
export function AdminField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
  error,
  locked = false,
  disabled = false,
  required = false,
  autoComplete = "off",
  multiline = false,
  rows = 4,
  maxLength
}) {
  const id = useId();

  // Same field, two shapes: anything paragraph-length gets a box it can be
  // read back in while it is being written, rather than a one-line slot that
  // scrolls its own beginning out of sight.
  const Control = multiline ? "textarea" : "input";

  // `locked`: shown but not editable, with a padlock saying so (an ID number).
  return (
    <div className={`admin-field${locked ? " admin-field--locked" : ""}`}>
      <label className="admin-field__label" htmlFor={id}>
        {label}
        {required && !locked ? <span className="admin-field__required"> *</span> : null}
      </label>
      <span className="admin-field__box">
        <Control
          id={id}
          className={`admin-input${multiline ? " admin-input--multiline" : ""}`}
          {...(multiline ? { rows } : { type })}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={locked}
          autoComplete={autoComplete}
          maxLength={maxLength}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {locked ? (
          <span className="admin-field__lock" aria-hidden="true">
            <LockIcon />
          </span>
        ) : null}
      </span>
      {/* A rule the value breaks wins over the hint. */}
      {error ? (
        <p className="admin-field__hint admin-field__hint--error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="admin-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}
