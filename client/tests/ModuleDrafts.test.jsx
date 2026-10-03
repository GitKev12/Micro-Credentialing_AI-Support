import { describe, it, expect, jest } from "@jest/globals";
import { render, screen, fireEvent, act } from "@testing-library/react";

import ModuleList from "../src/pages/admin/components/course/ModuleList.jsx";

const pdf = (name) => new File(["x"], name, { type: "application/pdf" });

const draw = (props = {}) =>
  render(
    <ModuleList
      modules={[{ id: "m1", title: "Intro" }]}
      detailStatus="ready"
      busy={false}
      confirming={null}
      impact={null}
      progress={0}
      onPreview={() => {}}
      onAskRemove={() => {}}
      onRemove={() => {}}
      onCancelRemove={() => {}}
      onAdd={jest.fn(async () => true)}
      {...props}
    />
  );

const addDraft = () => fireEvent.click(screen.getByRole("button", { name: "Module" }));

describe("+ Module drafts", () => {
  it("adds a draft row numbered after the uploaded lessons", () => {
    draw();
    addDraft();

    expect(screen.getByLabelText("Lesson 2 title")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload" }).disabled).toBe(true);
  });

  it("fills an empty title from the PDF name, and the title can be edited", () => {
    const { container } = draw();
    addDraft();
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [pdf("Chapter 2.pdf")] } });

    const title = screen.getByLabelText("Lesson 2 title");
    expect(title.value).toBe("Chapter 2");

    fireEvent.change(title, { target: { value: "Data Basics" } });
    expect(title.value).toBe("Data Basics");
  });

  it("uploads the draft and then drops it", async () => {
    const onAdd = jest.fn(async () => true);
    const { container } = draw({ onAdd });
    addDraft();
    const file = pdf("Chapter 2.pdf");
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    });

    expect(onAdd).toHaveBeenCalledWith({ files: [file], title: "Chapter 2" });
    expect(screen.queryByLabelText("Lesson 2 title")).toBeNull();
  });

  it("discards a draft", () => {
    draw();
    addDraft();
    fireEvent.click(screen.getByRole("button", { name: "Discard lesson 2" }));

    expect(screen.queryByLabelText("Lesson 2 title")).toBeNull();
  });
});
