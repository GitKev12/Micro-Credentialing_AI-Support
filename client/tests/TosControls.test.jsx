import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import QuestionsField from "../src/pages/assessor/components/tos/QuestionsField";
import Stepper from "../src/pages/assessor/components/tos/Stepper";

const split = {
  remember: 2,
  understand: 2,
  apply: 2,
  analyze: 3,
  evaluate: 3,
  create: 3
};

describe("QuestionsField", () => {
  it("shows the TOS count as an output and opens its editor", () => {
    const onModify = jest.fn();
    const { container } = render(<QuestionsField count={15} split={split} paper="quiz" onModify={onModify} />);

    expect(screen.getByLabelText("Number of questions").tagName).toBe("OUTPUT");
    expect(screen.getByLabelText("Number of questions")).toHaveTextContent("15");

    const lotsGroup = container.querySelector('[data-group="lots"]');
    const hotsGroup = container.querySelector('[data-group="hots"]');
    expect(within(lotsGroup).getByText("6")).toBeInTheDocument();
    expect(within(hotsGroup).getByText("9")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Modify TOS" }));
    expect(onModify).toHaveBeenCalledTimes(1);
  });

  it("makes an absent plan explicit", () => {
    render(<QuestionsField count={0} split={{}} paper="quiz" onModify={() => {}} />);

    expect(screen.getByLabelText("Number of questions")).toHaveTextContent("—");
    expect(screen.getByText("No TOS for this quiz yet.")).toBeInTheDocument();
  });
});

function StepperHarness() {
  const [value, setValue] = useState(15);
  return (
    <>
      <Stepper value={value} onChange={setValue} label="Questions in this quiz" />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("Stepper", () => {
  it("keeps a backspaced number as a draft until it is committed", () => {
    render(<StepperHarness />);
    const field = screen.getByRole("textbox", { name: "Questions in this quiz" });

    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "" } });

    expect(field).toHaveValue("");
    expect(screen.getByTestId("value")).toHaveTextContent("15");

    fireEvent.change(field, { target: { value: "20" } });
    fireEvent.blur(field);

    expect(screen.getByTestId("value")).toHaveTextContent("20");
  });

  it("restores the former value when an emptied field is left", () => {
    render(<StepperHarness />);
    const field = screen.getByRole("textbox", { name: "Questions in this quiz" });

    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);

    expect(field).toHaveValue("15");
  });
});
