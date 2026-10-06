import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const { render, screen, act, fireEvent, within } = await import("@testing-library/react");

const fetchDiscoverClasses = jest.fn();
const setDiscoverSettings = jest.fn();
const acceptRequest = jest.fn();
const declineRequest = jest.fn();
jest.unstable_mockModule("../src/services/discover.js", () => ({
  fetchDiscoverClasses,
  setDiscoverSettings,
  acceptRequest,
  declineRequest
}));

const { default: DiscoverManagement } = await import("../src/pages/admin/DiscoverManagement.jsx");

const request = { studentId: "s1", name: "Andrea Santiago", studentNumber: "STU2023300001" };
const row = (extra) => ({
  id: "k1", name: "Section-A", mode: "taught", course: { id: "c1", code: "CC2", title: "Computer Programming 2", status: "active" },
  assessor: "Ramon Velasco", active: true, posted: true, enrollment: "approval", studentCount: 7,
  refusal: null, requests: [request], ...extra
});

async function show() {
  await act(async () => {
    render(<DiscoverManagement />);
  });
}

const tableRow = (name) => screen.getAllByText(name)[0].closest("tr");

beforeEach(() => {
  fetchDiscoverClasses.mockReset();
  setDiscoverSettings.mockReset();
  acceptRequest.mockReset();
  declineRequest.mockReset();
});

describe("Admin Discover", () => {
  it("lists classes with their Posted switch", async () => {
    fetchDiscoverClasses.mockResolvedValue([
      row(),
      row({ id: "k2", name: "Section-B", posted: false, requests: [], refusal: "This class needs an assessor first.", assessor: null })
    ]);
    await show();

    const posted = within(tableRow("Section-A")).getByRole("switch");
    expect(posted.getAttribute("aria-checked")).toBe("true");
    // A class that can't take students can't be posted, and says why.
    const blocked = within(tableRow("Section-B")).getByRole("switch");
    expect(blocked.disabled).toBe(true);
    expect(blocked.getAttribute("title")).toBe("This class needs an assessor first.");
  });

  it("unposts a class", async () => {
    fetchDiscoverClasses.mockResolvedValue([row()]);
    setDiscoverSettings.mockResolvedValue(row({ posted: false, requests: [] }));
    await show();

    await act(async () => {
      fireEvent.click(within(tableRow("Section-A")).getByRole("switch"));
    });

    expect(setDiscoverSettings).toHaveBeenCalledWith("k1", { posted: false });
    expect(within(tableRow("Section-A")).getByRole("switch").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("No requests waiting.")).toBeTruthy();
  });

  it("accepts a request", async () => {
    fetchDiscoverClasses.mockResolvedValue([row()]);
    acceptRequest.mockResolvedValue(row({ studentCount: 8, requests: [] }));
    await show();

    const requestRow = screen.getByText("Andrea Santiago").closest("tr");
    expect(within(requestRow).getByText("STU2023300001")).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(requestRow).getByRole("button", { name: "Accept" }));
    });

    expect(acceptRequest).toHaveBeenCalledWith("k1", "s1");
    expect(screen.queryByText("Andrea Santiago")).toBeNull();
    expect(screen.getByText("No requests waiting.")).toBeTruthy();
  });

  it("declines a request", async () => {
    fetchDiscoverClasses.mockResolvedValue([row()]);
    declineRequest.mockResolvedValue(row({ requests: [] }));
    await show();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    });

    expect(declineRequest).toHaveBeenCalledWith("k1", "s1");
    expect(screen.queryByText("Andrea Santiago")).toBeNull();
  });

  it("shows the server's refusal", async () => {
    fetchDiscoverClasses.mockResolvedValue([row()]);
    acceptRequest.mockRejectedValue({ response: { data: { message: "This student's account isn't active." } } });
    await show();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    });

    expect(screen.getByText("This student's account isn't active.")).toBeTruthy();
    expect(screen.getByText("Andrea Santiago")).toBeTruthy();
  });
});
