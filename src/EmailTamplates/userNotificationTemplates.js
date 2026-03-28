const ROLE_COPY = {
  super_admin: {
    badge: "Super Admin Access",
    label: "Super Admin"
  },
  doctor: {
    badge: "Doctor Access",
    label: "Doctor"
  },
  nurse: {
    badge: "Nurse Access",
    label: "Nurse"
  },
  patient: {
    badge: "Patient Access",
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

function buildRows({ email, phone, userNumber, roleLabel }) {
  return [
    { label: "Role", value: roleLabel },
    { label: "User ID", value: userNumber ? String(userNumber) : "Not assigned" },
    { label: "Email", value: email || "Not available" },
    { label: "Phone", value: phone || "Not available" }
  ];
}

function buildInfoRows(rows) {
  return rows
    .map(
      ({ label, value }) => `
        <div style="padding:14px 16px;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0;margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#64748b">${label}</div>
          <div style="margin-top:8px;font-size:15px;font-weight:700;color:#0f172a">${value}</div>
        </div>
      `
    )
    .join("");
}

function buildTemplate({ badge, heading, intro, greeting, message, rows, callout, footer }) {
  const text = [
    greeting,
    intro,
    message,
    ...rows.map(({ label, value }) => `${label}: ${value}`),
    callout,
    footer
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="margin:0;font-family:Arial,sans-serif;color:#0f172a">
      <div style="margin:0 auto;background:#ffffff;border:1px solid #e2e8f0; overflow:hidden">
        <div style="padding:28px 32px;background:#111111">
          <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.16);font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#ffffff">
            ${badge}
          </div>
          <h1 style="margin:18px 0 8px;font-size:28px;line-height:1.2;color:#ffffff">${heading}</h1>
          <p style="margin:0;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.82)">${intro}</p>
        </div>
        <div style="padding:32px">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#0f172a">${greeting}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#334155">${message}</p>
          <div style="display:grid;gap:12px;margin:0 0 24px">
            ${buildInfoRows(rows)}
          </div>
          <div style="padding:18px 20px;border-radius:18px;background:#111111;color:#ffffff;font-size:14px;line-height:1.7">
            ${callout}
          </div>
          <p style="margin:24px 0 0;font-size:14px;line-height:1.8;color:#475569">${footer}</p>
        </div>
      </div>
    </div>
  `;

  return { text, html };
}

export function buildUserOnboardingTemplate({ name, role, email, phone, userNumber }) {
  const profile = getRoleContent(role);
  const displayName = toDisplayName(name);
  const rows = buildRows({ email, phone, userNumber, roleLabel: profile.label });
  const template = buildTemplate({
    badge: profile.badge,
    heading: `You are completely onboarded as ${profile.label}`,
    intro: `Your ${profile.label.toLowerCase()} account is now ready inside the Dr Harsha system.`,
    greeting: `Hello ${displayName},`,
    message: `You have been completely onboarded as ${profile.label.toLowerCase()} in our system. You can now use your registered email to access the portal. Your administrator will share any additional access instructions with you directly.`,
    rows,
    callout: `Please keep your user ID safe for future communication and verification.`,
    footer: `If you were not expecting this account, please contact the hospital administrator immediately.`
  });

  return {
    subject: `${profile.label} onboarding completed`,
    text: template.text,
    html: template.html
  };
}

export function buildUserBlockedTemplate({ name, role, email, phone, userNumber }) {
  const profile = getRoleContent(role);
  const displayName = toDisplayName(name);
  const rows = buildRows({ email, phone, userNumber, roleLabel: profile.label });
  const template = buildTemplate({
    badge: profile.badge,
    heading: `Your ${profile.label.toLowerCase()} access is blocked`,
    intro: `There is an update to your account status in the Dr Harsha system.`,
    greeting: `Hello ${displayName},`,
    message: `Your ${profile.label.toLowerCase()} account has been marked as blocked in our system. You will not be able to continue using the portal until your access is restored by an administrator.`,
    rows,
    callout: `If you believe this status was applied by mistake, please contact the hospital administrator for support.`,
    footer: `This is an account status notification from the Dr Harsha portal.`
  });

  return {
    subject: `${profile.label} account blocked`,
    text: template.text,
    html: template.html
  };
}

export function buildUserActiveTemplate({ name, role, email, phone, userNumber }) {
  const profile = getRoleContent(role);
  const displayName = toDisplayName(name);
  const rows = buildRows({ email, phone, userNumber, roleLabel: profile.label });
  const template = buildTemplate({
    badge: profile.badge,
    heading: `Your ${profile.label.toLowerCase()} access is active again`,
    intro: `There is an update to your account status in the Dr Harsha system.`,
    greeting: `Hello ${displayName},`,
    message: `Your ${profile.label.toLowerCase()} account is now active again in our system. You can continue using the portal with your registered account credentials.`,
    rows,
    callout: `If you still face any access issue, please contact the hospital administrator for support.`,
    footer: `This is an account status notification from the Dr Harsha portal.`
  });

  return {
    subject: `${profile.label} account activated`,
    text: template.text,
    html: template.html
  };
}
