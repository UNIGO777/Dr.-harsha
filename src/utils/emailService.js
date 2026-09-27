import nodemailer from "nodemailer";
import { buildAdminCustomEmailTemplate } from "../EmailTamplates/adminMessageTemplates.js";
import { buildAssignmentEmailTemplate } from "../EmailTamplates/assignmentTemplates.js";
import { buildAccountUpdateOtpTemplate, buildLoginOtpTemplate } from "../EmailTamplates/otpTemplates.js";
import { buildUserActiveTemplate, buildUserBlockedTemplate, buildUserOnboardingTemplate } from "../EmailTamplates/userNotificationTemplates.js";

/**
 * Mail delivery.
 *
 * A provider can refuse to send for reasons that have nothing to do with this
 * code — a suspended account, a billing hold, a sending-limit block. When that
 * happens every OTP fails and nobody can log in, so:
 *   • an optional SMTP_FALLBACK_* provider is tried before giving up,
 *   • failures raise a MailDeliveryError the API layer can turn into a 502 with
 *     a safe message, instead of leaking the raw SMTP reply to the browser.
 */

let cachedTransporter = null;
let cachedFallbackTransporter = null;

const mailHealth = {
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureDetail: "",
  consecutiveFailures: 0
};

/** Last known delivery state — exposed on /health so an outage is visible. */
export function getMailHealth() {
  return {
    healthy: mailHealth.consecutiveFailures === 0,
    lastSuccessAt: mailHealth.lastSuccessAt,
    lastFailureAt: mailHealth.lastFailureAt,
    consecutiveFailures: mailHealth.consecutiveFailures,
    lastFailureDetail: mailHealth.lastFailureDetail
  };
}

function toBool(value) {
  return String(value || "").toLowerCase() === "true";
}

/** Provider refused/failed to deliver — never surface `.message` to a client. */
export class MailDeliveryError extends Error {
  constructor(detail, { provider = "primary" } = {}) {
    super(typeof detail === "string" ? detail : String(detail?.message || detail));
    this.name = "MailDeliveryError";
    this.isMailDeliveryError = true;
    this.provider = provider;
    // What the user is allowed to see
    this.publicMessage = "We could not send the verification email right now. Please try again in a few minutes, or contact support if it keeps failing.";
  }
}

function buildTransport({ host, port, secure, user, pass }) {
  return nodemailer.createTransport({
    host,
    port: Number(port || 587),
    secure: toBool(secure),
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST || "";
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured");
  }

  cachedTransporter = buildTransport({
    host,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE,
    user,
    pass
  });

  return cachedTransporter;
}

/** Optional second provider, used only when the primary refuses. */
function getFallbackTransporter() {
  if (cachedFallbackTransporter !== null) return cachedFallbackTransporter;

  const host = process.env.SMTP_FALLBACK_HOST || "";
  const user = process.env.SMTP_FALLBACK_USER || "";
  const pass = process.env.SMTP_FALLBACK_PASS || "";

  if (!host || !user || !pass) {
    cachedFallbackTransporter = false;
    return false;
  }

  cachedFallbackTransporter = buildTransport({
    host,
    port: process.env.SMTP_FALLBACK_PORT,
    secure: process.env.SMTP_FALLBACK_SECURE,
    user,
    pass
  });
  return cachedFallbackTransporter;
}

function getFromAddress(fallback = false) {
  const from = fallback
    ? process.env.SMTP_FALLBACK_FROM || process.env.EMAIL_FROM || process.env.SMTP_FALLBACK_USER || ""
    : process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "";
  if (!from) throw new Error("EMAIL_FROM or SMTP_FROM must be configured");
  return from;
}

/**
 * Send through the primary provider, falling back to the secondary one.
 * Always throws MailDeliveryError on failure so callers can respond safely.
 */
function recordFailure(err) {
  mailHealth.lastFailureAt = new Date().toISOString();
  mailHealth.lastFailureDetail = String(err?.message || err).slice(0, 300);
  mailHealth.consecutiveFailures += 1;
  if (mailHealth.consecutiveFailures === 1 || mailHealth.consecutiveFailures % 10 === 0) {
    console.error(`[mail] ALERT: ${mailHealth.consecutiveFailures} consecutive delivery failures — OTP login is broken. ${mailHealth.lastFailureDetail}`);
  }
}

async function deliver(payload) {
  try {
    await getTransporter().sendMail({ ...payload, from: getFromAddress() });
    mailHealth.lastSuccessAt = new Date().toISOString();
    mailHealth.consecutiveFailures = 0;
    return { provider: "primary" };
  } catch (primaryError) {
    console.error(`[mail] primary provider failed: ${primaryError?.message || primaryError}`);

    const fallback = getFallbackTransporter();
    if (!fallback) {
      recordFailure(primaryError);
      throw new MailDeliveryError(primaryError, { provider: "primary" });
    }

    try {
      await fallback.sendMail({ ...payload, from: getFromAddress(true) });
      console.warn("[mail] delivered via fallback provider");
      mailHealth.lastSuccessAt = new Date().toISOString();
      mailHealth.consecutiveFailures = 0;
      return { provider: "fallback" };
    } catch (fallbackError) {
      console.error(`[mail] fallback provider failed: ${fallbackError?.message || fallbackError}`);
      recordFailure(fallbackError);
      throw new MailDeliveryError(fallbackError, { provider: "fallback" });
    }
  }
}

/**
 * Check the mail account at boot so a suspended provider is obvious in the
 * logs, instead of only showing up when a user cannot log in.
 */
export async function verifyMailTransport() {
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (err) {
    const detail = err?.message || String(err);
    console.error("┌─────────────────────────────────────────────────────────────");
    console.error("│ [mail] SMTP CHECK FAILED — outgoing email is NOT working.");
    console.error(`│ ${detail}`);
    console.error("│ Login and password-reset OTPs will fail until this is fixed.");
    if (!getFallbackTransporter()) {
      console.error("│ No SMTP_FALLBACK_* provider is configured.");
    }
    console.error("└─────────────────────────────────────────────────────────────");
    return { ok: false, detail };
  }
}

async function sendTemplateEmail({ toEmail, template }) {
  await deliver({
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

export async function sendAssignmentEmail({ toEmail, recipientName, doctorName, title, description, priority, dueAt }) {
  const template = buildAssignmentEmailTemplate({ recipientName, doctorName, title, description, priority, dueAt });
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

export async function sendPlainNotificationEmail({ toEmail, subject, body }) {
  await deliver({
    to: toEmail,
    subject,
    text: body,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;"><h2 style="color:#1a56db;">${subject}</h2><p style="color:#374151;white-space:pre-wrap;">${body}</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/><p style="font-size:12px;color:#9ca3af;">This is an automated notification from Dr. Harsha Health Portal.</p></div>`
  });
}
