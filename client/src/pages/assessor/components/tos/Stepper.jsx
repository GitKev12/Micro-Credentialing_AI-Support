import { toCount } from "./levels";

/**
 * The one control this screen is made of: a whole number of questions.
 *
 * A bare text field would do the job, but every figure here is nudged rather
 * than typed — an assessor moves two items from Applying to Analyzing, they do
 * not retype the paper — so the buttons are the primary way in and the field
 * is there for the larger jumps. The field keeps its own raw string while it
 * has focus so a half-typed number is not fought over on every keystroke; it
 * is only the committed value that has to be a count.
 */
export default function Stepper({ value, onChange, label, max = 999, disabled = false }) {
  const set = (next) => onChange(Math.max(0, Math.min(max, next)));

  return (
    <span className={`tos-step${disabled ? " is-disabled" : ""}`}>
      <button
        type="button"
        className="tos-step__btn"
        disabled={disabled || value <= 0}
        aria-label={`One fewer, ${label}`}
        onClick={() => set(value - 1)}
      >
        &minus;
      </button>
      <input
        className="tos-step__field"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        aria-label={label}
        onFocus={(event) => event.target.select()}
        onChange={(event) => set(toCount(event.target.value))}
      />
      <button
        type="button"
        className="tos-step__btn"
        disabled={disabled || value >= max}
        aria-label={`One more, ${label}`}
        onClick={() => set(value + 1)}
      >
        +
      </button>
    </span>
  );
}
