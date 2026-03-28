const ROLE_LABELS = {
  super_admin: "Super Admin",
  doctor: "Doctor",
  nurse: "Nurse",
  patient: "Patient"
};

function getRoleLabel(role) {
  if (typeof role !== "string") return ROLE_LABELS.patient;
  return ROLE_LABELS[role] || ROLE_LABELS.patient;
}

function getDisplayName(name) {
  return typeof name === "string" && name.trim() ? name.trim() : "User";
}

export function buildUserOnboardingWhatsappMessage({ name, role, email, userNumber }) {
  const roleLabel = getRoleLabel(role);

  return [
    `Hello ${getDisplayName(name)},`,
    `You have been completely onboarded as ${roleLabel} in the Dr Harsha system.`,
    `User ID: ${userNumber ? String(userNumber) : "Not assigned"}`,
    `Login Email: ${email || "Not available"}`,
    `Your administrator will share any additional access details with you directly.`
  ].join("\n");
}

export function buildUserBlockedWhatsappMessage({ name, role, userNumber }) {
  const roleLabel = getRoleLabel(role);

  return [
    `Hello ${getDisplayName(name)},`,
    `Your ${roleLabel.toLowerCase()} account has been blocked in the Dr Harsha system.`,
    `User ID: ${userNumber ? String(userNumber) : "Not assigned"}`,
    `Please contact your administrator if you believe this was done by mistake.`
  ].join("\n");
}

export function buildUserActiveWhatsappMessage({ name, role, userNumber }) {
  const roleLabel = getRoleLabel(role);

  return [
    `Hello ${getDisplayName(name)},`,
    `Your ${roleLabel.toLowerCase()} account is now active again in the Dr Harsha system.`,
    `User ID: ${userNumber ? String(userNumber) : "Not assigned"}`,
    `You can continue using the portal. Please contact your administrator if you still face any issue.`
  ].join("\n");
}

export async function sendWhatsappMessage({ toPhone, message, templateType, meta }) {
  if (!toPhone) {
    return { status: "skipped", reason: "Phone number is missing" };
  }

  console.log(`WhatsApp message to ${toPhone}: ${message}`);
  return { status: "sent" };
}
