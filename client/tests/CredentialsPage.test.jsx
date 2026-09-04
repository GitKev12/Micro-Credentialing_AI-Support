import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const ROWS = [
  {
    id: "r1",
    studentId: "st1",
    name: "Nicole Fernandez",
    sid: "202300417",
    credential: "Computer Programming 2 Credential",
    courseCode: "CC2",
    assessmentTitle: "Computer Programming 2 — Final Exam",
    score: 42,
    totalPoints: 50,
    passMark: 30
  },
  {
    id: "r2",
    studentId: "st2",
    name: "Miguel Bautista",
    sid: "202300218",
    credential: "Computer Programming 2 Credential",
    courseCode: "CC2",
    assessmentTitle: "Computer Programming 2 — Final Exam",
    score: 31,
    totalPoints: 50,
    passMark: 30
  }
];

let issueFails = false;
let issueCalls = [];

jest.unstable_mockModule("../src/services/assessors.js", () => ({
  storedAssessorId: () => "ASS001",
  fetchPendingCredentials: async () => ROWS,
  issueCredential: async (assessorId, submissionId) => {
    issueCalls.push({ assessorId, submissionId });
    if (issueFails) throw new Error("refused");
    return { credential: { status: "issued" } };
  }
}));

let CredentialsPage, MemoryRouter;

beforeAll(async () => {
  ({ MemoryRouter } = await import("react-router-dom"));
  ({ default: CredentialsPage } = await import("../src/pages/assessor/CredentialsPage.jsx"));
});

beforeEach(() => {
  issueFails = false;
  issueCalls = [];
});

const open = async () => {
  const { container } = render(
    <MemoryRouter>
      <CredentialsPage />
    </MemoryRouter>
  );
  await screen.findByText("Nicole Fernandez");
  return container;
};

const issueButtons = () => screen.getAllByRole("button", { name: "Issue credential" });

// Asked for by class rather than by role: the released row is itself a
// role="status" ("Issued today"), so a role query cannot tell the receipt
// from a message about it.
const noticeIn = (container) => container.querySelector(".assessor-notice");

describe("releasing a credential", () => {
  it("turns the row into the receipt, and says nothing on top of it", async () => {
    const container = await open();

    await act(async () => {
      fireEvent.click(issueButtons()[0]);
    });

    expect(issueCalls).toEqual([{ assessorId: "ASS001", submissionId: "r1" }]);
    expect(await screen.findByText("Issued today")).toBeInTheDocument();

    // The row already reports what happened. A message repeating it would only
    // be one more thing to read.
    expect(noticeIn(container)).toBeNull();

    // The other row is untouched.
    expect(issueButtons()).toHaveLength(1);
  });

  /**
   * The failure used to be swallowed whole: the button was left as it was so
   * the release could be retried, and nothing else happened. From the
   * assessor's side that is a button that does nothing — there is no telling a
   * refusal from a slow network, so the press gets repeated.
   */
  it("says so when the release is refused, and names who it was for", async () => {
    issueFails = true;
    await open();

    await act(async () => {
      fireEvent.click(issueButtons()[0]);
    });

    expect(
      await screen.findByText("Couldn't issue Nicole Fernandez's credential. Try again.")
    ).toBeInTheDocument();

    // Still offered, because the release can be tried again.
    expect(issueButtons()).toHaveLength(2);
    expect(screen.queryByText("Issued today")).not.toBeInTheDocument();
  });

  it("clears a standing failure once the retry lands", async () => {
    issueFails = true;
    const container = await open();

    await act(async () => {
      fireEvent.click(issueButtons()[0]);
    });
    await screen.findByText(/Couldn't issue/);

    issueFails = false;
    await act(async () => {
      fireEvent.click(issueButtons()[0]);
    });

    await waitFor(() => expect(noticeIn(container)).toBeNull());
    expect(await screen.findByText("Issued today")).toBeInTheDocument();
  });

  // Two students can fail in a row, and the second message has to be about the
  // second student rather than the first one still standing there.
  it("names the student the last failure was about", async () => {
    issueFails = true;
    await open();

    await act(async () => {
      fireEvent.click(issueButtons()[1]);
    });

    expect(
      await screen.findByText("Couldn't issue Miguel Bautista's credential. Try again.")
    ).toBeInTheDocument();
  });
});

describe("the count above the list", () => {
  it("drops as each one is released", async () => {
    await open();
    expect(screen.getByText("2 awaiting release")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(issueButtons()[0]);
    });

    expect(await screen.findByText("1 awaiting release")).toBeInTheDocument();
  });
});
