function toDisplayName(name) {
  return typeof name === "string" && name.trim() ? name.trim() : "User";
}

function toSafeText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

const PRIORITY_COLORS = {
  low: "#6B7280",
  medium: "#D97706",
  high: "#EA580C",
  critical: "#DC2626",
};

export function buildAssignmentEmailTemplate({ recipientName, doctorName, title, description, priority, dueAt }) {
  const displayName = toDisplayName(recipientName);
  const safeTitle = toSafeText(title, "New Assignment");
  const safeDescription = toSafeText(description, "No additional details provided.");
  const safePriority = priority || "medium";
  const priorityColor = PRIORITY_COLORS[safePriority] || PRIORITY_COLORS.medium;
  const safeDueAt = dueAt ? new Date(dueAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "No due date";
  const safeDoctorName = toSafeText(doctorName, "Your Doctor");

  const subject = `New Assignment: ${safeTitle}`;

  const text = [
    `Hello ${displayName},`,
    "",
    `You have received a new assignment from Dr. ${safeDoctorName}.`,
    "",
    `Title: ${safeTitle}`,
    `Priority: ${safePriority.charAt(0).toUpperCase() + safePriority.slice(1)}`,
    `Due: ${safeDueAt}`,
    "",
    `Details:`,
    safeDescription,
    "",
    "Please review and complete this assignment at your earliest convenience.",
    "",
    "— Dr Harsha Health System",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#F4F7FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FB;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#FFFFFF;border-radius:16px;border:1px solid #E5E7EB;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#2D6CC0,#3CB5A0);padding:28px 32px;">
          <div style="font-size:11px;letter-spacing:0.12em;color:rgba(255,255,255,0.75);text-transform:uppercase;font-weight:600;">New Assignment</div>
          <div style="margin-top:8px;font-size:22px;font-weight:700;color:#FFFFFF;">${safeTitle}</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          <div style="font-size:15px;color:#374151;line-height:1.7;">
            Hello <strong>${displayName}</strong>,
          </div>
          <div style="margin-top:12px;font-size:14px;color:#6B7280;line-height:1.7;">
            Dr. <strong>${safeDoctorName}</strong> has assigned you a new task. Please review the details below.
          </div>

          <!-- Assignment card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
            <tr><td style="padding:16px 20px;background:#F9FAFB;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;padding-bottom:6px;">Priority</td>
                  <td style="font-size:12px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;padding-bottom:6px;">Due date</td>
                </tr>
                <tr>
                  <td style="font-size:14px;font-weight:700;color:${priorityColor};">${safePriority.charAt(0).toUpperCase() + safePriority.slice(1)}</td>
                  <td style="font-size:14px;font-weight:600;color:#374151;">${safeDueAt}</td>
                </tr>
              </table>
            </td></tr>
            <tr><td style="padding:16px 20px;">
              <div style="font-size:12px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin-bottom:8px;">Description</div>
              <div style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-line;">${safeDescription}</div>
            </td></tr>
          </table>

          <div style="margin-top:20px;font-size:13px;color:#9CA3AF;line-height:1.6;">
            Please complete this assignment at your earliest convenience. If you have questions, contact Dr. ${safeDoctorName} directly.
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #F3F4F6;background:#FAFAFA;">
          <div style="font-size:12px;color:#9CA3AF;text-align:center;">Dr Harsha Health System &middot; Assignment Notification</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
