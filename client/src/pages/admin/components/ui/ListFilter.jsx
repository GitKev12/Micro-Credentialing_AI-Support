import { useState } from "react";
import { AdminSelect } from "./AdminSelect";

/** The value every field opens on: nothing narrowed. */
export const FILTER_ALL = "all";

/**
 * The list screens' filter: two triggers that read as one control — what to
 * filter on, and which one.
 *
 * It was a single dropdown holding one dimension, chosen once when course was
 * the only thing worth narrowing by. A class is also running or stood down and
 * is also somebody's to assess, and folding those into the same list would
 * have meant one flat run of options mixing three kinds of thing, with no way
 * to tell from the trigger which kind you had picked. Split, the left trigger
 * names the dimension and the right one narrows within it, so the pair always
 * says what is being filtered as well as how.
 *
 * A `field` is { id, label, options, match }, where `options` are the
 * AdminSelect shape — { value, label, meta? } — plus an optional `empty` line
 * for the screen to print when that option matches nothing.
 */
export function ListFilter({ fields, field, onFieldChange, value, onValueChange, noun }) {
  const active = fields.find((entry) => entry.id === field) ?? fields[0];
  if (!active) return null;

  return (
    <div className="admin-filter">
      <AdminSelect
        variant="admin-select--field"
        value={active.id}
        onChange={onFieldChange}
        label={`Choose what to filter ${noun} by`}
        options={fields.map((entry) => ({ value: entry.id, label: entry.label }))}
      />
      <AdminSelect
        variant="admin-select--value"
        value={value}
        onChange={onValueChange}
        label={`Filter ${noun} by ${active.label.toLowerCase()}`}
        options={active.options}
      />
    </div>
  );
}

/**
 * Holds the pair. Changing the field cannot keep the old value — a course id
 * means nothing to the status field, and leaving it in place would filter the
 * table to nothing the moment you changed what you were filtering on.
 */
export function useListFilter(defaultField) {
  const [field, setField] = useState(defaultField);
  const [value, setValue] = useState(FILTER_ALL);

  return {
    field,
    value,
    onFieldChange: (next) => {
      setField(next);
      setValue(FILTER_ALL);
    },
    onValueChange: setValue
  };
}

/** Does this row survive the filter as it currently stands? */
export function passesFilter(fields, field, value, row) {
  if (value === FILTER_ALL) return true;
  const active = fields.find((entry) => entry.id === field);
  return active ? active.match(row, value) : true;
}

/**
 * The option currently chosen, so a screen filtered down to nothing can say
 * which nothing it is looking at — "every class is tied to a course" and "no
 * class on this course yet" are different answers.
 */
export function chosenOption(fields, field, value) {
  const active = fields.find((entry) => entry.id === field);
  return active?.options.find((option) => option.value === value) ?? null;
}
