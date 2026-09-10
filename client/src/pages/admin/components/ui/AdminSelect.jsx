import { Select } from "../../../../components/Select";
import { CheckIcon, ChevronDownIcon } from "../icons";

/**
 * The admin console's select: the shared listbox in this console's clothes.
 *
 * Everything it does lives in `components/Select`; what is here is the block
 * name its stylesheet is written under and the two icons this console draws.
 * Kept as its own name and its own file so every call site and every rule in
 * admin.css reads the same as it did before the behaviour moved out.
 */
export function AdminSelect(props) {
  return (
    <Select
      {...props}
      classPrefix="admin-select"
      CaretIcon={ChevronDownIcon}
      TickIcon={CheckIcon}
    />
  );
}
