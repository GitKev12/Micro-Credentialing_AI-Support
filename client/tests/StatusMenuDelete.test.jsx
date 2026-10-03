import { describe, it, expect, jest } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";

import { StatusMenu } from "../src/pages/admin/components/ui/StatusMenu";

// The 3-dots menu offers Delete only once the row is archived.
const open = (props) => {
  render(<StatusMenu name="Ana Cruz" busy={false} onChange={() => {}} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Actions for Ana Cruz" }));
};

describe("Delete in the 3-dots menu", () => {
  it("is hidden while the row is active or inactive", () => {
    open({ status: "inactive", onDelete: () => {} });
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  });

  it("shows once the row is archived, and asks to delete", () => {
    const onDelete = jest.fn();
    open({ status: "archived", onDelete });

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
