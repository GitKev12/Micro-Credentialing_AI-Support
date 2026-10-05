const SLOTS = [0, 1, 2, 3, 4, 5];

// The visible digits are separate from the input, so keep its caret at the end.
const caretToEnd = (event) => {
  const input = event.target;
  const end = input.value.length;
  if (input.selectionStart !== end || input.selectionEnd !== end) {
    input.setSelectionRange(end, end);
  }
};

export default function CodeBoxes({ id, label, value, onChange, invalid, ...props }) {
  return (
    <span className="auth-field">
      <label htmlFor={id}>{label}</label>
      <span className="auth-code__box">
        <input
          {...props}
          id={id}
          className="auth-code__input"
          value={value}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={SLOTS.length}
          aria-invalid={invalid || undefined}
          onFocus={caretToEnd}
          onSelect={caretToEnd}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, SLOTS.length))}
        />
        <span className="auth-code__slots" aria-hidden="true">
          {SLOTS.map((slot) => (
            <span key={slot} className="auth-code__slot"
              data-active={slot === Math.min(value.length, SLOTS.length - 1) || undefined}>
              {value[slot] ?? ""}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
