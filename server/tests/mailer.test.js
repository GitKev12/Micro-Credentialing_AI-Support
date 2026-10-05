import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const sendMail = jest.fn(async () => ({}));
const createTransport = jest.fn(() => ({ sendMail }));
jest.unstable_mockModule("nodemailer", () => ({ default: { createTransport } }));
const { sendOtpEmail } = await import("../src/auth/mailer.js");

const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(SMTP_KEYS.map((key) => [key, process.env[key]]));
  for (const key of SMTP_KEYS) delete process.env[key];
  sendMail.mockClear();
});

afterEach(() => {
  for (const key of SMTP_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("sendOtpEmail", () => {
  it("prints the OTP instead of emailing when SMTP is not set up", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    await sendOtpEmail({ to: "ana@school.edu.ph", firstName: "Ana", otp: "123456", minutes: 10 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("123456"));
    expect(sendMail).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("sends from mcredentialingsys at the SMTP account, with the OTP in the email", async () => {
    Object.assign(process.env, {
      SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_USER: "sender@example.com", SMTP_PASS: "secret"
    });
    await sendOtpEmail({ to: "ana@school.edu.ph", firstName: "<Ana>", otp: "042917", minutes: 10 });

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.example.com", port: 587, secure: false, auth: { user: "sender@example.com", pass: "secret" }
    }));
    const mail = sendMail.mock.calls[0][0];
    expect(mail.from).toEqual({ name: "mcredentialingsys", address: "sender@example.com" });
    expect(mail.to).toBe("ana@school.edu.ph");
    expect(mail.text).toContain("042917");
    expect(mail.html).toContain("042917");
    // A name is put into the HTML as text, never as markup.
    expect(mail.html).toContain("&#60;Ana&#62;");
    expect(mail.html).not.toContain("<Ana>");
  });
});
