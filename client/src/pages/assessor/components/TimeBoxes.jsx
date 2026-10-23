import { useEffect, useId, useRef, useState } from "react";
import { MAX_HOURS, fromHoursAndMinutes, toHoursAndMinutes } from "../timeLimit";

const MAX_MINUTES_BOX = 59;

// Digits only, at most two, never past the box's own ceiling.
function cleanBox(value, max) {
  const digits = String(value).replace(/\D/g, "").slice(0, 2);
  if (digits === "") return "";
  return Number(digits) > max ? String(max) : digits;
}

// "1:30", "1h30" or "130" → { hours: "1", minutes: "30" }.
function readPasted(text) {
  const parts = text.split(/\D+/).filter(Boolean);
  if (parts.length >= 2) return { hours: parts[0], minutes: parts[1] };

  const digits = parts[0] ?? "";
  if (digits.length <= 2) return { hours: digits, minutes: "" };
  return { hours: digits.slice(0, -2), minutes: digits.slice(-2) };
}

/**
 * The time limit as two boxes, Hours and Minutes, the way a code is entered:
 * filling Hours moves on to Minutes, Backspace in an empty Minutes box goes
 * back, and a pasted "1:30" fills both. `minutes` is the total in minutes.
 */
export default function TimeBoxes({
  minutes,
  onChange,
  labelledBy,
  invalid = false,
  disabled = false
}) {
  const hoursId = useId();
  const minutesId = useId();
  const hoursBox = useRef(null);
  const minutesBox = useRef(null);
  const [text, setText] = useState(() => toHoursAndMinutes(minutes));

  // Another paper opened with a different length: show that length. While
  // the assessor is typing, the total already matches, so their text stays.
  useEffect(() => {
    setText((current) => {
      const shown = Number(fromHoursAndMinutes(current.hours, current.minutes)) || 0;
      return shown === (Math.floor(Number(minutes)) || 0) ? current : toHoursAndMinutes(minutes);
    });
  }, [minutes]);

  const update = (next) => {
    // Ten hours is the most a paper can run, so 10:30 shows as 10:00.
    const tooLong = Number(fromHoursAndMinutes(next.hours, next.minutes)) > MAX_HOURS * 60;
    const shown = tooLong ? { hours: String(MAX_HOURS), minutes: "00" } : next;

    setText(shown);
    onChange(fromHoursAndMinutes(shown.hours, shown.minutes));
  };

  const setHours = (value) => {
    const hours = cleanBox(value, MAX_HOURS);
    update({ ...text, hours });
    // Two digits, or a first digit that can't take a second (2 → 20 is past 10).
    if (hours.length === 2 || Number(`${hours}0`) > MAX_HOURS) minutesBox.current?.focus();
  };

  const setMinutes = (value) => update({ ...text, minutes: cleanBox(value, MAX_MINUTES_BOX) });

  // Leaving a box with one digit shows it as two: 1 → 01. Read from the
  // latest state, because moving on from Hours blurs it in the same event
  // that typed its last digit.
  const pad = (key) =>
    setText((current) =>
      current[key].length === 1 ? { ...current, [key]: current[key].padStart(2, "0") } : current
    );

  const paste = (event) => {
    event.preventDefault();
    const pasted = readPasted(event.clipboardData.getData("text"));
    update({
      hours: cleanBox(pasted.hours, MAX_HOURS),
      minutes: cleanBox(pasted.minutes, MAX_MINUTES_BOX)
    });
    minutesBox.current?.focus();
  };

  return (
    <div
      className={`time-boxes${invalid ? " is-invalid" : ""}${disabled ? " is-disabled" : ""}`}
      role="group"
      aria-labelledby={labelledBy}
    >
      <span className="time-boxes__unit">
        <input
          ref={hoursBox}
          id={hoursId}
          className="time-boxes__field"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={2}
          placeholder="00"
          value={text.hours}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setHours(event.target.value)}
          onBlur={() => pad("hours")}
          onPaste={paste}
        />
        <label className="time-boxes__name" htmlFor={hoursId}>
          Hours
        </label>
      </span>

      <span className="time-boxes__colon" aria-hidden="true">
        :
      </span>

      <span className="time-boxes__unit">
        <input
          ref={minutesBox}
          id={minutesId}
          className="time-boxes__field"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={2}
          placeholder="00"
          value={text.minutes}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setMinutes(event.target.value)}
          onBlur={() => pad("minutes")}
          onPaste={paste}
          onKeyDown={(event) => {
            // Backspace in an empty box goes back to Hours.
            if (event.key === "Backspace" && text.minutes === "") {
              event.preventDefault();
              hoursBox.current?.focus();
            }
          }}
        />
        <label className="time-boxes__name" htmlFor={minutesId}>
          Minutes
        </label>
      </span>
    </div>
  );
}
