import Stepper from "./Stepper";
import { questionTypes } from "./levels";

/**
 * How many True or False and Multiple Choice questions the paper gets.
 *
 * The default is the LOTS count as True or False and the HOTS count as
 * Multiple Choice, so it moves when the levels move. Changing a count here
 * never touches the levels: a True or False question can be at any level. The
 * other count takes the rest of the paper. `trueFalse` is null on the default.
 */
export default function TypeSplit({ split, total, trueFalse, onChange, disabled = false }) {
  const types = questionTypes(split, total, trueFalse);
  const fallback = questionTypes(split, total, null).trueFalse;

  // Landing back on the default count puts it back on the default.
  const setTrueFalse = (next) => {
    const count = Math.min(next, total);
    onChange(count === fallback ? null : count);
  };

  const rows = [
    {
      key: "true-false",
      label: "True or False",
      value: types.trueFalse,
      onChange: setTrueFalse
    },
    {
      key: "multiple-choice",
      label: "Multiple Choice",
      value: types.multipleChoice,
      onChange: (next) => setTrueFalse(total - Math.min(next, total))
    }
  ];

  return (
    <ul className="tos-rows tos-types">
      {rows.map((row) => (
        <li className="tos-row" key={row.key} data-type={row.key}>
          <span className="tos-row__name">{row.label}</span>
          <Stepper
            value={row.value}
            max={total}
            label={row.label}
            disabled={disabled}
            onChange={row.onChange}
          />
        </li>
      ))}
    </ul>
  );
}
