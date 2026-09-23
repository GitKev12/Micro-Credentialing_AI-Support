import { useId } from "react";

/**
 * Which pathway a class runs, as two cards rather than a dropdown.
 *
 * The choice decides what the class *is* — whether its candidates work through
 * the lessons or are examined on one paper — and it cannot be read off two
 * words in a closed select. Each option carries the one line that says what the
 * candidate actually does, so the admin never has to open a second screen or
 * hover something to find out which is which. Both lines are written from the
 * candidate's side, because that is who the difference is about.
 *
 * Radios, not buttons: it is one answer out of two, arrow keys move between
 * them, and a screen reader announces it as the single question it is.
 */

export const PATHWAYS = [
  {
    value: "taught",
    label: "Taught and assessed",
    detail: "Work through the lessons, pass each quiz, then take the final exam."
  },
  {
    value: "assessOnly",
    label: "Assess-only",
    detail: "Go straight to one examination. No lessons, no quizzes, no badges."
  }
];

export function PathwayChoice({ value, onChange, disabled = false, hint = null }) {
  const name = useId();
  const chosen = value === "assessOnly" ? "assessOnly" : "taught";

  return (
    <div className="admin-field">
      <div className="admin-field__label" id={`${name}-label`}>
        Pathway<span className="admin-field__required"> *</span>
      </div>
      <div className="admin-pathway" role="radiogroup" aria-labelledby={`${name}-label`}>
        {PATHWAYS.map((option) => (
          <label
            key={option.value}
            className={`admin-pathway__option${chosen === option.value ? " is-chosen" : ""}`}
          >
            <input
              type="radio"
              name={name}
              className="admin-pathway__input"
              value={option.value}
              checked={chosen === option.value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="admin-pathway__mark" aria-hidden="true" />
            <span className="admin-pathway__body">
              <span className="admin-pathway__name">{option.label}</span>
              <span className="admin-pathway__detail">{option.detail}</span>
            </span>
          </label>
        ))}
      </div>
      {hint ? <p className="admin-field__hint">{hint}</p> : null}
    </div>
  );
}

/** What a pathway is called wherever a class is listed rather than edited. */
export const pathwayLabel = (mode) =>
  PATHWAYS.find((option) => option.value === mode)?.label ?? PATHWAYS[0].label;
