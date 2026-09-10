import { describe, it, expect, jest, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, fireEvent } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

// The edit forms are the only children that reach for the API module, and they
// are mounted only while editing — which none of these tests do.
jest.unstable_mockModule("../src/services/admin.js", () => ({
  MIN_PASSWORD_LENGTH: 8
}));

let StudentDetail;
let AssessorDetail;

beforeAll(async () => {
  StudentDetail = (await import("../src/pages/admin/components/students/StudentDetail.jsx")).default;
  AssessorDetail = (await import("../src/pages/admin/components/assessors/AssessorDetail.jsx"))
    .default;
});

const STUDENT = {
  id: "s1",
  name: "Ana Cruz",
  email: "ana@tsu.edu.ph",
  studentNumber: "2021-0001",
  suspended: false,
  enrolled: [],
  progress: [],
  assessors: [],
  badges: { earned: 0, total: 0, courses: [], latest: null },
  lastActive: null
};

const ASSESSOR = {
  id: "a1",
  name: "Michael Torres",
  email: "mt@tsu.edu.ph",
  assessorNumber: "ASS001",
  suspended: false,
  classes: [],
  workload: null,
  lastActive: null
};

/**
 * Both detail screens take the same props and render the same rail, so the
 * cases below run twice rather than being written twice.
 */
const SCREENS = [
  ["StudentDetail", () => StudentDetail, STUDENT, "student"],
  ["AssessorDetail", () => AssessorDetail, ASSESSOR, "assessor"]
];

const draw = (Component, base, person = {}, props = {}) => {
  const subject = { ...base, ...person };
  // The two components name the prop after what they hold.
  const named = base === STUDENT ? { student: subject } : { assessor: subject };

  return render(
    <Component
      {...named}
      detailStatus="ready"
      busy={false}
      notice={null}
      form={null}
      formError={null}
      onBack={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
      onToggleSuspended={() => {}}
      onCancelForm={() => {}}
      onSave={() => {}}
      {...props}
    />
  );
};

describe.each(SCREENS)("%s — the account switch lives with the person", (_name, get, base) => {
  it("puts the switch in the identity block, beside Edit and Delete", () => {
    const { container } = draw(get(), base);

    const actions = container.querySelector(".admin-identity__actions");
    expect(actions).toBeTruthy();
    expect(actions.querySelector(".admin-switch")).toBeTruthy();
    expect(actions.querySelector(".admin-identity__acts")).toBeTruthy();
  });

  it("reads the account's state, and says which way it is set", () => {
    const { container } = draw(get(), base, { suspended: false });
    const on = container.querySelector(".admin-switch");

    expect(on.getAttribute("role")).toBe("switch");
    expect(on.getAttribute("aria-checked")).toBe("true");
    expect(on.textContent).toContain("Active");

    const { container: second } = draw(get(), base, { suspended: true });
    const off = second.querySelector(".admin-switch");
    expect(off.getAttribute("aria-checked")).toBe("false");
    expect(off.textContent).toContain("Suspended");
  });

  it("asks to flip it when pressed", () => {
    const onToggleSuspended = jest.fn();
    const { container } = draw(get(), base, {}, { onToggleSuspended });

    fireEvent.click(container.querySelector(".admin-switch"));

    expect(onToggleSuspended).toHaveBeenCalledTimes(1);
  });

  // The switch reports the state as well as setting it, so the pill that used
  // to sit beside the name was the same word twice in one block.
  it("does not repeat the status as a pill beside the name", () => {
    const { container } = draw(get(), base, { suspended: true });

    expect(container.querySelectorAll(".admin-status-pill").length).toBe(0);
  });

  it("holds the switch still while a write is in flight", () => {
    const { container } = draw(get(), base, {}, { busy: true });

    expect(container.querySelector(".admin-switch").disabled).toBe(true);
  });
});

describe("the two screens agree", () => {
  it("names the person as the heading, with nothing else in it", () => {
    const { container } = draw(StudentDetail, STUDENT);
    expect(container.querySelector(".admin-identity__name").textContent).toBe("Ana Cruz");

    const { container: second } = draw(AssessorDetail, ASSESSOR);
    expect(second.querySelector(".admin-identity__name").textContent).toBe("Michael Torres");
  });

  it("keeps Edit and Delete reachable", () => {
    draw(AssessorDetail, ASSESSOR);

    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });
});
