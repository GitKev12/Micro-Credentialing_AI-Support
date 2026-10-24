import { describe, it, expect } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import TimeBoxes from "../src/pages/assessor/components/TimeBoxes";

// The boxes beside the total they send, as the Generate screen holds it.
function Harness({ start = 90 }) {
  const [minutes, setMinutes] = useState(start);
  return (
    <>
      <span id="limit-label">Time limit</span>
      <TimeBoxes labelledBy="limit-label" minutes={minutes} onChange={setMinutes} />
      <output data-testid="total">{String(minutes)}</output>
    </>
  );
}

const hours = () => screen.getByRole("textbox", { name: "Hours" });
const minutes = () => screen.getByRole("textbox", { name: "Minutes" });

describe("TimeBoxes", () => {
  it("shows the length as hours and minutes in their own boxes", () => {
    render(<Harness />);

    expect(screen.getByRole("group", { name: "Time limit" })).toBeInTheDocument();
    expect(hours()).toHaveValue("01");
    expect(minutes()).toHaveValue("30");
  });

  it("sends the total in minutes", () => {
    render(<Harness start="" />);

    fireEvent.change(hours(), { target: { value: "02" } });
    fireEvent.change(minutes(), { target: { value: "15" } });

    expect(screen.getByTestId("total")).toHaveTextContent("135");
  });

  it("moves on to Minutes once Hours is filled", () => {
    render(<Harness start="" />);
    hours().focus();

    fireEvent.change(hours(), { target: { value: "01" } });
    expect(minutes()).toHaveFocus();
  });

  it("moves on straight away when the hour can't take a second digit", () => {
    render(<Harness start="" />);
    hours().focus();

    fireEvent.change(hours(), { target: { value: "3" } });
    expect(minutes()).toHaveFocus();
    // Shown as two digits once Hours is left.
    expect(hours()).toHaveValue("03");
  });

  it("goes back to Hours on Backspace in an empty Minutes box", () => {
    render(<Harness start="" />);
    minutes().focus();

    fireEvent.keyDown(minutes(), { key: "Backspace" });
    expect(hours()).toHaveFocus();
  });

  it("fills both boxes from a pasted 1:45", () => {
    render(<Harness start="" />);

    fireEvent.paste(hours(), { clipboardData: { getData: () => "1:45" } });

    expect(minutes()).toHaveValue("45");
    expect(screen.getByTestId("total")).toHaveTextContent("105");
  });

  it("holds each box to its ceiling", () => {
    render(<Harness start="" />);

    fireEvent.change(hours(), { target: { value: "01" } });
    fireEvent.change(minutes(), { target: { value: "75" } });
    expect(minutes()).toHaveValue("59");

    fireEvent.change(hours(), { target: { value: "12" } });
    expect(hours()).toHaveValue("10");
  });

  it("never runs past ten hours", () => {
    render(<Harness start="" />);

    fireEvent.change(hours(), { target: { value: "10" } });
    fireEvent.change(minutes(), { target: { value: "30" } });

    expect(minutes()).toHaveValue("00");
    expect(screen.getByTestId("total")).toHaveTextContent("600");
  });
});
