import nodemailer from "nodemailer";
import { buildAdminCustomEmailTemplate } from "../EmailTamplates/adminMessageTemplates.js";
import { buildAccountUpdateOtpTemplate, buildLoginOtpTemplate } from "../EmailTamplates/otpTemplates.js";
import { buildUserActiveTemplate, buildUserBlockedTemplate, buildUserOnboardingTemplate } from "../EmailTamplates/userNotificationTemplates.js";

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

function getFromAddress() {
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "";
  if (!from) throw new Error("EMAIL_FROM or SMTP_FROM must be configured");
  return from;
}

async function sendTemplateEmail({ toEmail, template }) {
  const transporter = getTransporter();

  await transporter.sendMail({
    from: getFromAddress(),
    to: toEmail,
    subject: template.subject,
    text: template.text,
    html: template.html,
    attachments: Array.isArray(template.attachments) ? template.attachments : undefined
  });
}

export async function sendLoginOtpEmail({ toEmail, name, otp, role }) {
  const expiryMinutes = Number(process.env.OTP_EXPIRES_MINUTES || 10);
  const template = buildLoginOtpTemplate({ name, otp, role, expiryMinutes });
  await sendTemplateEmail({ toEmail, template });
}

export async function sendAccountUpdateOtpEmail({ toEmail, name, otp, role, actionType }) {
  const expiryMinutes = Number(process.env.OTP_EXPIRES_MINUTES || 10);
  const template = buildAccountUpdateOtpTemplate({ name, otp, role, expiryMinutes, actionType });
  await sendTemplateEmail({ toEmail, template });
}

export async function sendUserOnboardingEmail({ toEmail, name, role, phone, userNumber }) {
  const template = buildUserOnboardingTemplate({ name, role, email: toEmail, phone, userNumber });
  await sendTemplateEmail({ toEmail, template });
}

export async function sendUserBlockedEmail({ toEmail, name, role, phone, userNumber }) {
  const template = buildUserBlockedTemplate({ name, role, email: toEmail, phone, userNumber });
  await sendTemplateEmail({ toEmail, template });
}

export async function sendUserActiveEmail({ toEmail, name, role, phone, userNumber }) {
  const template = buildUserActiveTemplate({ name, role, email: toEmail, phone, userNumber });
  await sendTemplateEmail({ toEmail, template });
}

export async function sendAdminCustomEmail({ toEmail, name, role, subject, message, summary, userNumber, attachments }) {
  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  const template = buildAdminCustomEmailTemplate({
    name,
    role,
    subject,
    message,
    summary,
    userNumber,
    attachmentNames: safeAttachments.map((attachment) => attachment.filename)
  });
  template.attachments = safeAttachments;
  await sendTemplateEmail({ toEmail, template });
}
