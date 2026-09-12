import { useState } from "react";
import { toCount } from "./levels";

/**
 * The one control this screen is made of: a whole number of questions.
 *
 * A bare text field would do the job, but every figure here is nudged rather
 * than typed — an assessor moves two items from Applying to Analyzing, they do
 * not retype the paper — so the buttons are the primary way in and the field
 * is there for the larger jumps. A typed number is a draft until the field is
 * left or Enter is pressed: a quiz length re-apportions its complete mix, so
 * committing every keystroke turns Backspace into a destructive edit.
 */
export default function Stepper({ value, onChange, label, max = 999, disabled = false }) {
  const [typing, setTyping] = useState(null);
  const set = (next) => onChange(Math.max(0, Math.min(max, next)));

  const commit = () => {
    if (typing === null) return;
    setTyping(null);

    // Clearing is the start of retyping a value, not an instruction to erase
    // the blueprint's current count. Zero remains available by typing 0.
    if (typing === "") return;

    const next = Math.min(max, toCount(typing));
    if (next !== value) set(next);
  };

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
        value={typing ?? value}
        disabled={disabled}
        aria-label={label}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setTyping(event.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit();
        }}
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
