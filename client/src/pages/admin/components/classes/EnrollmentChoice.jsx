import { useId } from "react";

/**
 * How a student gets into this class from Discover, as two cards rather than
 * a dropdown. Same markup as PathwayChoice, so it looks and works the same.
 */
export const ENROLLMENT = [
  { value: "approval", label: "Needs approval", detail: "Students send a request. You accept or decline it here." },
  { value: "open", label: "Open", detail: "Students join at once, with no request." }
];

export const enrollmentLabel = (value) =>
  ENROLLMENT.find((option) => option.value === value)?.label ?? ENROLLMENT[0].label;

export function EnrollmentChoice({ value, onChange, disabled = false }) {
  const name = useId();
  const chosen = value === "open" ? "open" : "approval";

  return (
    <div className="admin-field">
      <div className="admin-field__label" id={`${name}-label`}>
        Enrollment
      </div>
      <div className="admin-pathway" role="radiogroup" aria-labelledby={`${name}-label`}>
        {ENROLLMENT.map((option) => (
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
    </div>
  );
}
