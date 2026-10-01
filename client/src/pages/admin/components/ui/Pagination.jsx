import { Pagination as SharedPagination } from "../../../../components/Pagination";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";

export { PAGE_SIZE, usePagination } from "../../../../components/Pagination";

// The shared pagination with this console's class names (admin.css) and arrows.
export function Pagination(props) {
  return (
    <SharedPagination
      {...props}
      classPrefix="admin-pagination"
      PrevIcon={ChevronLeftIcon}
      NextIcon={ChevronRightIcon}
    />
  );
}
