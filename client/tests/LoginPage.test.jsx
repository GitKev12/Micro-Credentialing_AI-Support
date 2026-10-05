import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, fireEvent } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

/**
 * One sign-in screen for every role with Sign In / Sign Up toggle.
 *
 * The page always sends ID number/email and password to the same login request.
 * The API decides whether the account is a Student, Assessor or Admin.
 */

const login = jest.fn();
const saveAuthSession = jest.fn();
// Who this browser already has signed in, as localStorage would hand it back.
let storedSession = null;

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  login,
  saveAuthSession,
  getStoredSession: () => storedSession,
  signupStudent: jest.fn()
}));

let LoginPage, MemoryRouter, Routes, Route;

beforeAll(async () => {
  ({ MemoryRouter, Routes, Route } = await import("react-router-dom"));
  ({ default: LoginPage } = await import("../src/auth/pages/LoginPage.jsx"));
});

beforeEach(() => {
  login.mockReset();
  saveAuthSession.mockReset();
  storedSession = null;
});

const draw = (entries = ["/login"]) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<LoginPage />} />
        <Route path="/student" element={<p>Student End</p>} />
        <Route path="/assessor" element={<p>Assessor End</p>} />
        <Route path="/admin" element={<p>Admin End</p>} />
      </Routes>
    </MemoryRouter>
  );

const submit = () => {
  const submitBtns = screen.getAllByRole("button", { name: /^(Sign in|Create account)$/ });
  // Click the last one in the DOM (the submit button, not the toggle)
  fireEvent.click(submitBtns[submitBtns.length - 1]);
};

describe("LoginPage", () => {
  it("uses one ID number or email field for every role", () => {
    draw();

    expect(screen.getByLabelText("ID Number or Email").type).toBe("text");
    expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Client" })).toBeNull();
  });

  it("renders the Sign In and Sign Up toggle buttons", () => {
    draw();

    const toggleGroup = screen.getByRole("group", { name: "Authentication option" });
    const signInToggle = toggleGroup.querySelector("button.is-login");
    const signUpToggle = toggleGroup.querySelector("button.is-signup");

    expect(signInToggle).toBeTruthy();
    expect(signUpToggle).toBeTruthy();
    expect(signInToggle.classList.contains("is-active")).toBe(true);
    expect(signUpToggle.classList.contains("is-active")).toBe(false);
  });

  it("switches to the signup form when clicking the Sign Up toggle", async () => {
    draw();

    const toggleGroup = screen.getByRole("group", { name: "Authentication option" });
    const signUpToggle = toggleGroup.querySelector("button.is-signup");
    fireEvent.click(signUpToggle);

    expect(await screen.findByLabelText("First name")).toBeTruthy();
    expect(screen.getByLabelText("Last name")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
  });

  it("signs in a student with the shared login request", async () => {
    login.mockResolvedValue({ token: "t", user: { role: "student" }, redirectTo: "/student" });
    draw();

    fireEvent.change(screen.getByLabelText("ID Number or Email"), { target: { value: "STU202330001" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough" } });
    submit();

    expect(await screen.findByText("Student End")).toBeTruthy();
    expect(login).toHaveBeenCalledWith({ identifier: "STU202330001", password: "longenough" });
    expect(saveAuthSession).toHaveBeenCalledTimes(1);
  });

  it("signs in an assessor with the shared login request", async () => {
    login.mockResolvedValue({ token: "t", user: { role: "assessor" }, redirectTo: "/assessor" });
    draw();

    fireEvent.change(screen.getByLabelText("ID Number or Email"), { target: { value: "ASS001" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough" } });
    submit();

    expect(await screen.findByText("Assessor End")).toBeTruthy();
    expect(login).toHaveBeenCalledWith({ identifier: "ASS001", password: "longenough" });
  });

  it("signs in an admin without a role toggle", async () => {
    login.mockResolvedValue({ token: "t", user: { role: "admin" }, redirectTo: "/admin" });
    draw();

    fireEvent.change(screen.getByLabelText("ID Number or Email"), {
      target: { value: "admin@tsu.edu.ph" }
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough" } });
    submit();

    expect(await screen.findByText("Admin End")).toBeTruthy();
    expect(login).toHaveBeenCalledWith({ identifier: "admin@tsu.edu.ph", password: "longenough" });
  });

  it("shows the server's reason when the ID number or password is wrong", async () => {
    login.mockRejectedValue({ response: { data: { message: "Invalid ID number, email, or password." } } });
    draw();

    fireEvent.change(screen.getByLabelText("ID Number or Email"), { target: { value: "202300001" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-one" } });
    submit();

    expect((await screen.findByRole("alert")).textContent).toBe("Invalid ID number, email, or password.");
  });

  it("has a Forgot password link under the Password field", () => {
    draw();

    const link = screen.getByRole("link", { name: "Forgot password?" });
    expect(link.getAttribute("href")).toBe("/forgot-password");
    // It comes after the Password box and before the Sign in button.
    const password = screen.getByLabelText("Password");
    expect(password.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the account-created message after signup", () => {
    draw([{ pathname: "/login", state: { message: "Account created. You can now sign in." } }]);

    expect(screen.getByRole("status").textContent).toBe("Account created. You can now sign in.");
  });
});

/**
 * The session is kept in localStorage, which every tab shares. A second tab
 * opened on /login used to show the sign-in form to somebody already signed in.
 */
describe("LoginPage — somebody already signed in", () => {
  it("sends them to the console they signed into", async () => {
    storedSession = { token: "t", user: { role: "assessor" }, redirectTo: "/assessor" };
    draw();

    expect(await screen.findByText("Assessor End")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("falls back to the role's own console when the session names no path", async () => {
    storedSession = { token: "t", user: { role: "admin" } };
    draw();

    expect(await screen.findByText("Admin End")).toBeTruthy();
  });
});
