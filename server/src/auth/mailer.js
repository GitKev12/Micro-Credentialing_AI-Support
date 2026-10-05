import nodemailer from "nodemailer";

/*
 * Sends the password-reset OTP by email.
 *
 * The settings are read when an email is sent, not when this file loads:
 * index.js runs dotenv.config() after its imports, so a value read up here
 * would always be empty.
 */

let transporter = null;

/** True when the SMTP settings in server/.env are filled in. */
export function mailerReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // Port 465 starts encrypted; 587 and 2525 upgrade to encryption after connecting.
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

async function send({ to, firstName, code, subject, intro, footer }) {
  if (!mailerReady()) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP is not configured.");
    // No SMTP settings (a local machine): print the code so the flow can still be tried.
    console.log(`[mailer] SMTP is not set up, so nothing was emailed. Code for ${to}: ${code}`);
    return;
  }

  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const text = [
    greeting,
    "",
    intro,
    code,
    "",
    footer
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1d1712; max-width: 480px;">
      <p>${escapeHtml(greeting)}</p>
      <p>${escapeHtml(intro)}</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #7d1f2b;">${code}</p>
      <p>${escapeHtml(footer)}</p>
    </div>`;

  await getTransporter().sendMail({
    // Most providers (Gmail included) only send from the signed-in account,
    // so the address is SMTP_USER and EMAIL_FROM is the name people see.
    from: { name: process.env.EMAIL_FROM || "mcredentialingsys", address: process.env.SMTP_USER },
    to,
    subject,
    text,
    html
  });
}

export async function sendOtpEmail({ to, firstName, otp, minutes }) {
  await send({
    to,
    firstName,
    code: otp,
    minutes,
    subject: "Your password reset OTP",
    intro: "Your OTP to reset your password is:",
    footer: `It expires in ${minutes} minutes. If you did not ask to reset your password, ignore this email. Your password stays the same.`
  });
}

export async function sendSignupCodeEmail({ to, code, minutes }) {
  await send({
    to,
    firstName: "",
    code,
    minutes,
    subject: "Your email verification code",
    intro: "Your code to verify your email is:",
    footer: `It expires in ${minutes} minutes. If you did not sign up, ignore this email.`
  });
}
