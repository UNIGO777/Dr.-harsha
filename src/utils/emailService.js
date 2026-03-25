import nodemailer from "nodemailer";
import { buildLoginOtpTemplate } from "../EmailTamplates/otpTemplates.js";

let cachedTransporter = null;

function toBool(value) {
  return String(value || "").toLowerCase() === "true";
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST || "";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured");
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: toBool(process.env.SMTP_SECURE),
    auth: { user, pass }
  });

  return cachedTransporter;
}

export async function sendLoginOtpEmail({ toEmail, name, otp, role }) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "";
  if (!from) throw new Error("EMAIL_FROM or SMTP_FROM must be configured");

  const transporter = getTransporter();
  const expiryMinutes = Number(process.env.OTP_EXPIRES_MINUTES || 10);
  const template = buildLoginOtpTemplate({ name, otp, role, expiryMinutes });

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: template.subject,
    text: template.text,
    html: template.html
  });
}
