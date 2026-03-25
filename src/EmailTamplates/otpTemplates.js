const ROLE_COPY = {
  super_admin: {
    badge: "Super Admin Access",
    heading: "Super admin login verification",
    intro: "You are signing in to the hospital management command center.",
    accent: "#7c3aed"
  },
  doctor: {
    badge: "Doctor Access",
    heading: "Doctor portal login verification",
    intro: "Use this OTP to access your doctor workspace securely.",
    accent: "#0f766e"
  },
  nurse: {
    badge: "Nurse Access",
    heading: "Nurse portal login verification",
    intro: "Use this OTP to continue into the nursing operations panel.",
    accent: "#2563eb"
  },
  patient: {
    badge: "Patient Access",
    heading: "Patient portal login verification",
    intro: "Use this OTP to access your patient dashboard securely.",
    accent: "#ea580c"
  }
};

function getRoleContent(role) {
  if (typeof role !== "string") return ROLE_COPY.patient;
  return ROLE_COPY[role] || ROLE_COPY.patient;
}

export function buildLoginOtpTemplate({ name, otp, role, expiryMinutes }) {
  const profile = getRoleContent(role);
  const displayName = typeof name === "string" && name.trim() ? name.trim() : "User";
  const safeOtp = String(otp || "").trim();
  const minutes = Number.isFinite(Number(expiryMinutes)) ? Number(expiryMinutes) : 10;

  const text = [
    `Hello ${displayName},`,
    profile.intro,
    `Your one-time password is ${safeOtp}.`,
    `This code expires in ${minutes} minutes.`,
    "If you did not request this login, please contact your hospital administrator immediately."
  ].join("\n");

  const html = `
    <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden">
        <div style="padding:28px 32px;background:${profile.accent}">
          <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,0.18);font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#ffffff">
            ${profile.badge}
          </div>
          <h1 style="margin:18px 0 8px;font-size:28px;line-height:1.2;color:#ffffff">${profile.heading}</h1>
          <p style="margin:0;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.92)">${profile.intro}</p>
        </div>
        <div style="padding:32px">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#0f172a">Hello ${displayName},</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#334155">
            Please use the one-time password below to complete your secure login.
          </p>
          <div style="margin:0 0 24px;padding:22px 24px;border-radius:20px;background:#f8fafc;border:1px dashed ${profile.accent};text-align:center">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#64748b">One-Time Password</div>
            <div style="margin-top:12px;font-size:36px;font-weight:800;letter-spacing:8px;color:${profile.accent}">${safeOtp}</div>
          </div>
          <div style="padding:18px 20px;border-radius:18px;background:#eff6ff;color:#1e3a8a;font-size:14px;line-height:1.7">
            This OTP will expire in <strong>${minutes} minutes</strong>.
          </div>
          <p style="margin:24px 0 0;font-size:14px;line-height:1.8;color:#475569">
            If you did not request this login, please contact your hospital administrator immediately.
          </p>
        </div>
      </div>
    </div>
  `;

  return {
    subject: `${profile.badge} OTP for login`,
    text,
    html
  };
}

