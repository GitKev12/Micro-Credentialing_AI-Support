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

export async function sendOtpEmail({ to, firstName, otp, minutes }) {
  if (!mailerReady()) {
    // No SMTP settings (a local machine): print the OTP so the flow can still be tried.
    console.log(`[mailer] SMTP is not set up, so nothing was emailed. OTP for ${to}: ${otp}`);
    return;
  }

  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const text = [
    greeting,
    "",
    `Your OTP to reset your password is: ${otp}`,
    "",
    `It expires in ${minutes} minutes. If you did not ask to reset your password, ignore this email. Your password stays the same.`
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1d1712; max-width: 480px;">
      <p>${escapeHtml(greeting)}</p>
      <p>Your OTP to reset your password is:</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #7d1f2b;">${otp}</p>
      <p>It expires in ${minutes} minutes. If you did not ask to reset your password, ignore this email. Your password stays the same.</p>
    </div>`;

  await getTransporter().sendMail({
    // Most providers (Gmail included) only send from the signed-in account,
    // so the address is SMTP_USER and EMAIL_FROM is the name people see.
    from: { name: process.env.EMAIL_FROM || "mcredentialingsys", address: process.env.SMTP_USER },
    to,
    subject: "Your password reset OTP",
    text,
    html
  });
}
