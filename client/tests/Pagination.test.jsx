import { describe, it, expect } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";

import { Pagination, usePagination } from "../src/pages/admin/components/ui/Pagination.jsx";

const ROWS = Array.from({ length: 42 }, (_, i) => `Row ${i + 1}`);

// A tiny table that uses the hook the way the admin screens do.
function Table({ rows = ROWS, resetKey = "" }) {
  const { pageRows, page, pageCount, setPage } = usePagination(rows, resetKey);
  return (
    <>
      <ul>
        {pageRows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
      <Pagination page={page} pageCount={pageCount} onChange={setPage} label="Rows" />
    </>
  );
}

describe("Pagination", () => {
  it("shows 10 rows per page", () => {
    render(<Table />);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("Row 1")).toBeTruthy();
    expect(screen.queryByText("Row 11")).toBeNull();
  });

  it("moves to the next page and back", () => {
    render(<Table />);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Row 11")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBe("page");

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("Row 1")).toBeTruthy();
  });

  it("disables Previous on the first page and Next on the last", () => {
    render(<Table />);
    expect(screen.getByRole("button", { name: "Previous page" }).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Page 5" }));
    expect(screen.getByText("Row 42")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next page" }).disabled).toBe(true);
  });

  it("shows first, last and the pages around the current one, with gaps", () => {
    render(<Table rows={Array.from({ length: 95 }, (_, i) => `Row ${i + 1}`)} />);
    fireEvent.click(screen.getByRole("button", { name: "Page 10" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 9" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 8" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 7" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 6" }));

    const pages = screen.getAllByRole("button", { name: /^Page / }).map((b) => b.textContent);
    expect(pages).toEqual(["1", "5", "6", "7", "10"]);
  });

  it("goes back to page 1 when the search or filter changes", () => {
    const { rerender } = render(<Table resetKey="a" />);
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(screen.getByText("Row 11")).toBeTruthy();

    rerender(<Table resetKey="b" />);
    expect(screen.getByText("Row 1")).toBeTruthy();
  });

  it("renders nothing when everything fits on one page", () => {
    const { container } = render(<Table rows={["Only row"]} />);
    expect(container.querySelector(".admin-pagination")).toBeNull();
  });
});
