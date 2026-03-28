const ROLE_COPY = {
  super_admin: {
    badge: "Super Admin Message",
    label: "Super Admin"
  },
  doctor: {
    badge: "Doctor Message",
    label: "Doctor"
  },
  nurse: {
    badge: "Nurse Message",
    label: "Nurse"
  },
  patient: {
    badge: "Patient Message",
    label: "Patient"
  }
};

function getRoleContent(role) {
  if (typeof role !== "string") return ROLE_COPY.patient;
  return ROLE_COPY[role] || ROLE_COPY.patient;
}

function toDisplayName(name) {
  return typeof name === "string" && name.trim() ? name.trim() : "User";
}

function toSafeText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function splitParagraphs(value) {
  return toSafeText(value, "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildAdminCustomEmailTemplate({ name, role, subject, message, summary, userNumber, attachmentNames }) {
  const profile = getRoleContent(role);
  const displayName = toDisplayName(name);
  const safeSubject = toSafeText(subject, `${profile.label} update`);
  const safeMessage = toSafeText(message, "There is an update for your account.");
  const safeSummary = toSafeText(summary, "Please review the details below and contact the administrator if you need any help.");
  const paragraphs = splitParagraphs(safeMessage);
  const safeAttachmentNames = Array.isArray(attachmentNames) ? attachmentNames.filter((item) => typeof item === "string" && item.trim()) : [];
  const attachmentsText = safeAttachmentNames.length > 0 ? `Attachments included: ${safeAttachmentNames.join(", ")}` : "";

  const text = [
    `Hello ${displayName},`,
    safeSummary,
    safeMessage,
    `Role: ${profile.label}`,
    `User ID: ${userNumber ? String(userNumber) : "Not assigned"}`,
    attachmentsText,
    "This message was sent from the Dr Harsha admin panel."
  ].join("\n\n");

  const htmlParagraphs = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:#334155">${paragraph}</p>`
    )
    .join("");

  const html = `
    <div style="margin:0;font-family:Arial,sans-serif;color:#0f172a">
      <div style="margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;overflow:hidden">
        <div style="padding:28px 32px;background:#111111">
          <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.16);font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#ffffff">
            ${profile.badge}
          </div>
          <h1 style="margin:18px 0 8px;font-size:28px;line-height:1.2;color:#ffffff">${safeSubject}</h1>
          <p style="margin:0;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.82)">${safeSummary}</p>
        </div>
        <div style="padding:32px">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#0f172a">Hello ${displayName},</p>
          ${htmlParagraphs}
          ${safeAttachmentNames.length > 0 ? `<div style="margin:0 0 16px;padding:16px 18px;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0;font-size:14px;line-height:1.7;color:#334155">Attachments included: ${safeAttachmentNames.join(", ")}</div>` : ""}
          <div style="padding:18px 20px;border-radius:18px;background:#111111;color:#ffffff;font-size:14px;line-height:1.7">
            This message was sent from the Dr Harsha admin panel.
          </div>
        </div>
      </div>
    </div>
  `;

  return {
    subject: safeSubject,
    text,
    html
  };
}
