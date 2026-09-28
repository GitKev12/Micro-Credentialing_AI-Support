import { describe, it, expect, jest } from "@jest/globals";
import { render, screen, fireEvent, act } from "@testing-library/react";

import AddModuleForm from "../src/pages/admin/components/course/AddModuleForm.jsx";

const pdf = (name, size = 1000) => new File(["x".repeat(size)], name, { type: "application/pdf" });

const draw = (props = {}) =>
  render(<AddModuleForm nextNumber={4} busy={false} progress={0} step={null} onAdd={jest.fn()} {...props} />);

const pick = (container, files) =>
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files } });

describe("AddModuleForm — several files at once", () => {
  it("lets the file picker choose more than one file", () => {
    const { container } = draw();
    expect(container.querySelector('input[type="file"]').multiple).toBe(true);
  });

  it("keeps the title field for a single file, named after it", () => {
    const { container } = draw();
    pick(container, [pdf("Chapter 1.pdf")]);

    expect(screen.getByLabelText("Module title").value).toBe("Chapter 1");
    expect(screen.getByRole("button", { name: "Add module" })).toBeTruthy();
  });

  it("lists several files and offers to add them all", () => {
    const { container } = draw();
    pick(container, [
      pdf("Chapter 1.pdf"),
      pdf("Chapter 2.pdf"),
      new File(["x"], "notes.txt", { type: "text/plain" })
    ]);

    // The .txt is left out; only PDFs are kept.
    expect(screen.getByText("Chapter 1")).toBeTruthy();
    expect(screen.getByText("Chapter 2")).toBeTruthy();
    expect(screen.queryByText("notes")).toBeNull();
    expect(screen.queryByLabelText("Module title")).toBeNull();
    expect(screen.getByRole("button", { name: "Add 2 modules" })).toBeTruthy();
  });

  it("hands every file to onAdd", async () => {
    const onAdd = jest.fn(async () => true);
    const { container } = draw({ onAdd });
    const files = [pdf("A.pdf"), pdf("B.pdf")];
    pick(container, files);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add 2 modules" }));
    });

    expect(onAdd).toHaveBeenCalledWith({ files, title: "" });
  });

  it("says which file is uploading when there are several", () => {
    const { container } = draw({ busy: true, progress: 40, step: { index: 2, total: 3 } });
    pick(container, [pdf("A.pdf"), pdf("B.pdf"), pdf("C.pdf")]);

    expect(screen.getByRole("button", { name: "Uploading 2 of 3… 40%" })).toBeTruthy();
  });
});
