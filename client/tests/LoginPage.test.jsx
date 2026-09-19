import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, fireEvent } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

/**
 * One sign-in screen, two credentials.
 *
 * Students and assessors sign in with their ID number or their email; admin
 * with an email only. The box has to accept the right thing and send it to the
 * right endpoint — an ID number typed into an email box is refused by the
 * browser before any request is made.
 */

const login = jest.fn();
const loginAdmin = jest.fn();
const saveAuthSession = jest.fn();
// Who this browser already has signed in, as localStorage would hand it back.
let storedSession = null;

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  login,
  loginAdmin,
  saveAuthSession,
  getStoredSession: () => storedSession
}));

let LoginPage, MemoryRouter, Routes, Route;

beforeAll(async () => {
  ({ MemoryRouter, Routes, Route } = await import("react-router-dom"));
  ({ default: LoginPage } = await import("../src/auth/pages/LoginPage.jsx"));
});

beforeEach(() => {
  login.mockReset();
  loginAdmin.mockReset();
  saveAuthSession.mockReset();
  storedSession = null;
});

const draw = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/assessor" element={<p>Assessor console</p>} />
        <Route path="/admin" element={<p>Admin console</p>} />
      </Routes>
    </MemoryRouter>
  );

const submit = () =>
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form"));

describe("LoginPage", () => {
  it("asks students and assessors for their ID number or email", () => {
    draw();

    expect(screen.getByLabelText("ID Number or Email").type).toBe("text");
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("signs in with the ID number typed", async () => {
    login.mockResolvedValue({ token: "t", user: { role: "assessor" }, redirectTo: "/assessor" });
    draw();

    fireEvent.change(screen.getByLabelText("ID Number or Email"), { target: { value: "ASS001" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough" } });
    submit();

    expect(await screen.findByText("Assessor console")).toBeTruthy();
    expect(login).toHaveBeenCalledWith({ identifier: "ASS001", password: "longenough" });
    expect(loginAdmin).not.toHaveBeenCalled();
    expect(saveAuthSession).toHaveBeenCalledTimes(1);
  });

  it("signs in with an email in the same box", async () => {
    login.mockResolvedValue({ token: "t", user: { role: "assessor" }, redirectTo: "/assessor" });
    draw();

    fireEvent.change(screen.getByLabelText("ID Number or Email"), {
      target: { value: "mt@tsu.edu.ph" }
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough" } });
    submit();

    expect(await screen.findByText("Assessor console")).toBeTruthy();
    expect(login).toHaveBeenCalledWith({ identifier: "mt@tsu.edu.ph", password: "longenough" });
    expect(loginAdmin).not.toHaveBeenCalled();
  });

  it("keeps admin on email, and clears the ID number when switching", async () => {
    loginAdmin.mockResolvedValue({ token: "t", user: { role: "admin" }, redirectTo: "/admin" });
    draw();

    fireEvent.change(screen.getByLabelText("ID Number or Email"), { target: { value: "202300001" } });
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));

    const email = screen.getByLabelText("Email");
    expect(email.type).toBe("email");
    expect(email.value).toBe("");

    fireEvent.change(email, { target: { value: "admin@tsu.edu.ph" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough" } });
    submit();

    expect(await screen.findByText("Admin console")).toBeTruthy();
    expect(loginAdmin).toHaveBeenCalledWith({
      identifier: "admin@tsu.edu.ph",
      password: "longenough"
    });
    expect(login).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the ID number or password is wrong", async () => {
    login.mockRejectedValue({ response: { data: { message: "Invalid ID number, email, or password." } } });
    draw();

    fireEvent.change(screen.getByLabelText("ID Number or Email"), { target: { value: "202300001" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-one" } });
    submit();

    expect((await screen.findByRole("alert")).textContent).toBe("Invalid ID number, email, or password.");
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

    expect(await screen.findByText("Assessor console")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("falls back to the role's own console when the session names no path", async () => {
    storedSession = { token: "t", user: { role: "admin" } };
    draw();

    expect(await screen.findByText("Admin console")).toBeTruthy();
  });
});
