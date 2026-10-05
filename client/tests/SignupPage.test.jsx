import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const login = jest.fn();
const signupStudent = jest.fn();
const sendSignupCode = jest.fn();
const verifySignupCode = jest.fn();
const saveAuthSession = jest.fn();
let storedSession = null;

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  login,
  signupStudent,
  sendSignupCode,
  verifySignupCode,
  saveAuthSession,
  getStoredSession: () => storedSession
}));

let LoginPage, MemoryRouter, Routes, Route;

beforeAll(async () => {
  ({ MemoryRouter, Routes, Route } = await import("react-router-dom"));
  ({ default: LoginPage } = await import("../src/auth/pages/LoginPage.jsx"));
});

beforeEach(() => {
  signupStudent.mockReset();
  // The email must be verified before Register can be pressed.
  // The code lasts 10 minutes, like the real server's.
  const inTenMinutes = async () => ({ expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  sendSignupCode.mockReset().mockImplementation(inTenMinutes);
  verifySignupCode.mockReset().mockImplementation(inTenMinutes);
  storedSession = null;
});

const draw = () =>
  render(
    <MemoryRouter initialEntries={["/signup"]}>
      <Routes>
        <Route path="/signup" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/student" element={<p>Student End</p>} />
      </Routes>
    </MemoryRouter>
  );

const fillValidForm = async () => {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Juan" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Dela Cruz" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "juan@student.edu.ph" } });

  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  const codeInput = await screen.findByLabelText("Verification code");
  fireEvent.change(codeInput, { target: { value: "123456" } });
  await screen.findByText("Verified");

  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123!" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Password123!" } });
};

const submit = () => {
  const submitBtns = screen.getAllByRole("button", { name: /^(Sign in|Register)$/ });
  // Click the last one in the DOM (the submit button, not the toggle)
  fireEvent.click(submitBtns[submitBtns.length - 1]);
};

describe("SignupPage", () => {
  it("shows the student registration fields", () => {
    draw();

    expect(screen.getByLabelText("First name")).toBeTruthy();
    expect(screen.getByLabelText("Last name")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
    expect(screen.queryByLabelText("Program")).toBeNull();
    expect(screen.queryByLabelText("Year")).toBeNull();
  });

  it("waits 60 seconds before another code, even for a new email", async () => {
    draw();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "juan@student.edu.ph" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect((await screen.findByRole("button", { name: "Wait 60s" })).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "juana@student.edu.ph" } });
    const button = screen.getByRole("button", { name: "Wait 60s" });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(sendSignupCode).toHaveBeenCalledTimes(1);
  });

  it("still shows Verified after going to Sign in and back", async () => {
    draw();
    await fillValidForm();

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByLabelText("ID Number or Email");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText("Verified")).toBeTruthy();
    expect(screen.getByLabelText("Email").value).toBe("juan@student.edu.ph");
    expect(screen.getByRole("button", { name: "Register" }).disabled).toBe(false);
    expect(sendSignupCode).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid names before calling the API", async () => {
    draw();
    await fillValidForm();
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "J" } });
    submit();

    expect((await screen.findByRole("alert")).textContent).toBe("First name must be at least 2 letters.");
    expect(signupStudent).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", async () => {
    draw();
    await fillValidForm();
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different" }
    });
    submit();

    expect((await screen.findByRole("alert")).textContent).toBe("Passwords must match.");
    expect(signupStudent).not.toHaveBeenCalled();
  });

  it("rejects passwords over 72 UTF-8 bytes", async () => {
    draw();
    await fillValidForm();
    const longUnicode = "ñ".repeat(37);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: longUnicode } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: longUnicode } });
    submit();

    expect((await screen.findByRole("alert")).textContent).toBe("Password can be at most 72 bytes.");
    expect(signupStudent).not.toHaveBeenCalled();
  });

  it("creates the account and returns to sign-in", async () => {
    signupStudent.mockResolvedValue({ message: "Account created. You can now sign in." });
    draw();
    await fillValidForm();
    submit();

    expect(await screen.findByText("Login")).toBeTruthy();
    expect(signupStudent).toHaveBeenCalledWith({
      firstName: "Juan",
      lastName: "Dela Cruz",
      email: "juan@student.edu.ph",
      password: "Password123!",
      code: "123456"
    });
  });

  it("does not submit twice while creating the account", async () => {
    let finish;
    signupStudent.mockImplementation(
      () => new Promise((resolve) => {
        finish = () => resolve({ message: "Account created. You can now sign in." });
      })
    );
    draw();
    await fillValidForm();

    submit();
    fireEvent.click(await screen.findByRole("button", { name: "Registering..." }));

    expect(signupStudent).toHaveBeenCalledTimes(1);
    finish();
    expect(await screen.findByText("Login")).toBeTruthy();
  });

  it("shows the server signup error", async () => {
    signupStudent.mockRejectedValue({ response: { data: { message: "An account with these details already exists." } } });
    draw();
    await fillValidForm();
    submit();

    expect((await screen.findByRole("alert")).textContent).toBe("An account with these details already exists.");
  });

  it("sends a signed-in browser to its End", async () => {
    storedSession = { token: "t", user: { role: "student" }, redirectTo: "/student" };
    draw();

    expect(await screen.findByText("Student End")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Register" })).toBeNull();
  });
});
