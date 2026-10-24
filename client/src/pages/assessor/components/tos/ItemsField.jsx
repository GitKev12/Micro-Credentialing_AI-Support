import { useId, useState } from "react";
import { toCount } from "./levels";

/**
 * The exam's number of items, typed into one box.
 *
 * Like the Stepper, a typed number is a draft until the box is left or Enter
 * is pressed: changing the length re-spreads the levels, so committing every
 * keystroke would turn Backspace into a wiped split. Leaving the box empty
 * puts the old number back.
 */
export default function ItemsField({ value, onChange, max = 999, disabled = false }) {
  const id = useId();
  const [typing, setTyping] = useState(null);

  const commit = () => {
    if (typing === null) return;
    setTyping(null);
    if (typing === "") return;

    const next = Math.min(max, toCount(typing));
    if (next !== value) onChange(next);
  };

  return (
    <span className={`tos-items${disabled ? " is-disabled" : ""}`}>
      <label className="tos-items__label" htmlFor={id}>
        No. Items
      </label>
      <input
        id={id}
        className="tos-items__field"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={typing ?? value}
        disabled={disabled}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setTyping(event.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit();
        }}
      />
    </span>
  );
}
