import { useEffect, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "../icons";

export const PAGE_SIZE = 10;

// Splits `rows` into pages. `resetKey` is anything that changes when the
// search or filter changes, so the table jumps back to page 1.
export function usePagination(rows, resetKey = "", pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  // If rows were removed (e.g. archived), don't stay on a page that no longer exists.
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;

  return {
    pageRows: rows.slice(start, start + pageSize),
    page: current,
    pageCount,
    setPage
  };
}

// Which page numbers to show: first, last, current and one either side.
// `null` marks a gap (…).
function pageList(page, pageCount) {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);

  const list = [];
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1] > 1) list.push(null);
    list.push(n);
  });
  return list;
}

// Page buttons under a table. Renders nothing when everything fits on one page.
export function Pagination({ page, pageCount, onChange, label }) {
  if (pageCount <= 1) return null;

  return (
    <nav className="admin-pagination" aria-label={`${label} pages`}>
      <button
        type="button"
        className="admin-pagination__step"
        aria-label="Previous page"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeftIcon size={15} />
      </button>

      {pageList(page, pageCount).map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className="admin-pagination__gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            className={`admin-pagination__page${n === page ? " is-current" : ""}`}
            aria-current={n === page ? "page" : undefined}
            aria-label={`Page ${n}`}
            onClick={() => n !== page && onChange(n)} // the current page does nothing
          >
            {n}
          </button>
        )
      )}

      <button
        type="button"
        className="admin-pagination__step"
        aria-label="Next page"
        disabled={page === pageCount}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRightIcon size={15} />
      </button>
    </nav>
  );
}
