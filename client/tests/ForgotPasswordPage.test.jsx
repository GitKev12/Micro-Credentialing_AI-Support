import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, fireEvent } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const requestPasswordOtp = jest.fn();
const resetPasswordWithOtp = jest.fn();
let storedSession = null;

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  requestPasswordOtp,
  resetPasswordWithOtp,
  getStoredSession: () => storedSession
}));

let ForgotPasswordPage, MemoryRouter, Routes, Route, useLocation;

beforeAll(async () => {
  ({ MemoryRouter, Routes, Route, useLocation } = await import("react-router-dom"));
  ({ default: ForgotPasswordPage } = await import("../src/auth/pages/ForgotPasswordPage.jsx"));
});

beforeEach(() => {
  requestPasswordOtp.mockReset();
  resetPasswordWithOtp.mockReset();
  storedSession = null;
});

// Stands in for the sign-in page and shows the message it was sent back with.
function LoginStub() {
  const location = useLocation();
  return <p>Login page: {location.state?.message}</p>;
}

const draw = (entry = "/forgot-password") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<LoginStub />} />
        <Route path="/student" element={<p>Student End</p>} />
      </Routes>
    </MemoryRouter>
  );

const click = (name) => fireEvent.click(screen.getByRole("button", { name }));
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

// Gets through step 1 with a working email.
const reachOtpStep = async () => {
  requestPasswordOtp.mockResolvedValue({ message: "sent" });
  draw();
  type("Email", "ana@school.edu.ph");
  click("Send OTP");
  await screen.findByLabelText("OTP");
};

describe("ForgotPasswordPage", () => {
  it("asks for an email first", () => {
    draw();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByLabelText("OTP")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe("/login");
  });

  it("starts with the email carried over from sign in", () => {
    draw({ pathname: "/forgot-password", state: { email: "ana@school.edu.ph" } });
    expect(screen.getByLabelText("Email").value).toBe("ana@school.edu.ph");
  });

  it("checks the email before sending anything", async () => {
    draw();
    type("Email", "not-an-email");
    click("Send OTP");
    expect((await screen.findByRole("alert")).textContent).toMatch(/valid email/);
    expect(requestPasswordOtp).not.toHaveBeenCalled();
  });

  it("sends the OTP and moves on to the OTP and new password", async () => {
    await reachOtpStep();
    expect(requestPasswordOtp).toHaveBeenCalledWith("ana@school.edu.ph");
    expect(screen.getByRole("status").textContent).toContain("ana@school.edu.ph");
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm new password")).toBeTruthy();
    // Resend waits a minute, like the server.
    expect(screen.getByRole("button", { name: /Resend OTP in 60s/ }).disabled).toBe(true);
  });

  it("shows the server's reason when the OTP cannot be sent", async () => {
    requestPasswordOtp.mockRejectedValue({ response: { data: { message: "Too many OTP requests. Try again in 15 minutes." } } });
    draw();
    type("Email", "ana@school.edu.ph");
    click("Send OTP");
    expect((await screen.findByRole("alert")).textContent).toBe("Too many OTP requests. Try again in 15 minutes.");
    expect(screen.queryByLabelText("OTP")).toBeNull();
  });

  it("keeps only digits in the OTP box", async () => {
    await reachOtpStep();
    type("OTP", "12a-34 56");
    expect(screen.getByLabelText("OTP").value).toBe("123456");
  });

  it.each([
    ["12345", "new password", "new password", "Enter the 6-digit OTP from the email."],
    ["123456", "short", "short", "Password must be at least 8 characters."],
    ["123456", "new password", "other password", "Passwords must match."]
  ])("checks OTP %s and the passwords before calling the API", async (otp, password, confirm, message) => {
    await reachOtpStep();
    type("OTP", otp);
    type("New password", password);
    type("Confirm new password", confirm);
    click("Change password");
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(resetPasswordWithOtp).not.toHaveBeenCalled();
  });

  it("changes the password and goes back to sign in with a message", async () => {
    await reachOtpStep();
    resetPasswordWithOtp.mockResolvedValue({ message: "Password changed. You can now sign in." });
    type("OTP", "123456");
    type("New password", "new password");
    type("Confirm new password", "new password");
    click("Change password");

    expect(await screen.findByText("Login page: Password changed. You can now sign in.")).toBeTruthy();
    expect(resetPasswordWithOtp).toHaveBeenCalledWith({
      email: "ana@school.edu.ph", otp: "123456", newPassword: "new password"
    });
  });

  it("shows the server's reason for a wrong OTP", async () => {
    await reachOtpStep();
    resetPasswordWithOtp.mockRejectedValue({ response: { data: { message: "That OTP is not right. Check the email and try again." } } });
    type("OTP", "000000");
    type("New password", "new password");
    type("Confirm new password", "new password");
    click("Change password");
    expect((await screen.findByRole("alert")).textContent).toBe("That OTP is not right. Check the email and try again.");
  });

  it("goes back to the email step with Change email", async () => {
    await reachOtpStep();
    click("Change email");
    expect(screen.getByLabelText("Email").value).toBe("ana@school.edu.ph");
    expect(screen.queryByLabelText("OTP")).toBeNull();
  });

  it("sends somebody already signed in to their End", async () => {
    storedSession = { token: "t", user: { role: "student" }, redirectTo: "/student" };
    draw();
    expect(await screen.findByText("Student End")).toBeTruthy();
  });
});
