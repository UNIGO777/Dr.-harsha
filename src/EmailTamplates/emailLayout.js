// Shared email template layout components for Dr Harsha Healthcare

const FONT = "'Poppins','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const LOGO_URL = process.env.EMAIL_LOGO_URL || '';
const YEAR = new Date().getFullYear();

export const ROLE_THEMES = {
  super_admin: {
    primary: '#E91E63',
    heroBg: '#FFF1F7',
    bodyBg: '#FFF7FB',
    artBg: '#FBE0EC',
    iconBg: '#FCE4EC',
    borderColor: '#FBE0EC',
    textDark: '#1F2937',
    textMuted: '#6B7280',
    label: 'Super Admin',
    badge: 'Super Admin Access',
    otpBoxBg: '#FFF7FB',
    otpBoxBorder: '#FCE4EC',
    needHelpBg: '#FFF1F7'
  },
  doctor: {
    primary: '#0E6FB8',
    heroBg: '#E9F4FC',
    bodyBg: '#F2F8FD',
    artBg: '#CFE6F7',
    iconBg: '#E2F1FB',
    borderColor: '#CFE6F7',
    textDark: '#14375E',
    textMuted: '#5B7186',
    label: 'Doctor',
    badge: 'Doctor Access',
    otpBoxBg: '#F2F8FD',
    otpBoxBorder: '#E2F1FB',
    needHelpBg: '#E9F4FC'
  },
  nurse: {
    primary: '#16A34A',
    heroBg: '#ECFBF1',
    bodyBg: '#F6FDF8',
    artBg: '#D4F4DF',
    iconBg: '#DCFCE7',
    borderColor: '#D4F4DF',
    textDark: '#0F172A',
    textMuted: '#64748B',
    label: 'Nurse',
    badge: 'Nurse Access',
    otpBoxBg: '#F6FDF8',
    otpBoxBorder: '#DCFCE7',
    needHelpBg: '#ECFBF1'
  },
  patient: {
    primary: '#0E6FB8',
    heroBg: '#E9F4FC',
    bodyBg: '#F2F8FD',
    artBg: '#CFE6F7',
    iconBg: '#E2F1FB',
    borderColor: '#CFE6F7',
    textDark: '#14375E',
    textMuted: '#5B7186',
    label: 'Patient',
    badge: 'Patient Access',
    otpBoxBg: '#F2F8FD',
    otpBoxBorder: '#E2F1FB',
    needHelpBg: '#E9F4FC'
  }
};

export function getRoleTheme(role) {
  if (typeof role !== 'string') return ROLE_THEMES.patient;
  return ROLE_THEMES[role] || ROLE_THEMES.patient;
}

export function toDisplayName(name) {
  return typeof name === 'string' && name.trim() ? name.trim() : 'User';
}

export function toSafe(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/* ── Logo ─────────────────────────────────────────────────────── */

function headerLogoHtml(textColor = '#14375E') {
  if (LOGO_URL) {
    return `<img src="${LOGO_URL}" alt="Dr Harsha Healthcare" width="148" style="display:block;width:148px;height:auto;">`;
  }
  return `<div style="font-family:${FONT};font-size:18px;font-weight:700;color:${textColor};line-height:1.3;">Dr Harsha <span style="font-weight:400;">Healthcare</span></div>`;
}

function footerLogoHtml() {
  if (LOGO_URL) {
    return `<img src="${LOGO_URL}" alt="Dr Harsha Healthcare" width="118" style="display:inline-block;width:118px;height:auto;margin-bottom:14px;">`;
  }
  return `<div style="font-family:${FONT};font-size:16px;font-weight:700;color:#14375E;margin-bottom:14px;">Dr Harsha Healthcare</div>`;
}

/* ── Hero Art (double-circle with symbol) ─────────────────────── */

export function buildHeroArt({ symbol, color, lightColor }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
    <td align="center" valign="middle" style="width:130px;height:130px;border-radius:50%;background:${lightColor};">
      <div style="width:78px;height:78px;border-radius:50%;background:${color};text-align:center;line-height:78px;font-family:${FONT};font-size:34px;font-weight:700;color:#ffffff;">${symbol}</div>
    </td>
  </tr></table>`;
}

export function buildBoldHeroArt({ symbol, bgAlpha = 'rgba(255,255,255,0.15)', borderAlpha = 'rgba(255,255,255,0.55)' }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
    <td align="center" valign="middle" style="width:120px;height:120px;border-radius:50%;background:${bgAlpha};border:1px dashed ${borderAlpha};">
      <div style="width:70px;height:70px;border-radius:50%;background:rgba(255,255,255,0.25);text-align:center;line-height:70px;font-family:${FONT};font-size:32px;font-weight:700;color:#ffffff;">${symbol}</div>
    </td>
  </tr></table>`;
}

/* ── Email Wrapper ────────────────────────────────────────────── */

export function wrapEmail({ bodyContent, preheader = '', theme }) {
  const t = theme || ROLE_THEMES.doctor;
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<title>Dr Harsha Healthcare</title>
<!--[if mso]><style>*{font-family:Arial,Helvetica,sans-serif!important;}</style><![endif]-->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
  body{margin:0;padding:0;}
  table{border-collapse:collapse;}
  img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
  a{text-decoration:none;}
  @media only screen and (max-width:620px){
    .container{width:100%!important;}
    .px{padding-left:24px!important;padding-right:24px!important;}
    .stack{display:block!important;width:100%!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${t.bodyBg};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.bodyBg};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
${bodyContent}
${buildNeedHelp(t)}
${buildFooter(t)}
</table>
${buildUnsubscribeBar(t)}
</td></tr></table>
</body>
</html>`;
}

/* ── Light Hero (OTP, Welcome, Status) ────────────────────────── */

export function buildLightHero({ theme, badgeText, title, checkIcon = '&#10003;', checkText, description, artHtml }) {
  const t = theme;
  return `<tr><td style="background:${t.heroBg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td class="px" colspan="2" style="padding:26px 40px 16px 40px;">${headerLogoHtml()}</td></tr>
    <tr>
      <td class="stack px" valign="middle" style="padding:10px 6px 30px 40px;width:56%;font-family:${FONT};">
        <div style="font-size:13px;color:${t.textMuted};font-weight:500;margin-bottom:7px;">${badgeText}</div>
        <div style="border-left:4px solid ${t.primary};padding-left:15px;">
          <div style="font-size:25px;line-height:1.18;font-weight:700;color:${t.textDark};">${title}</div>
          ${checkText ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:15px;"><tr>
            <td valign="middle"><div style="width:26px;height:26px;border-radius:50%;background:${t.primary};text-align:center;font-family:${FONT};color:#fff;font-size:14px;font-weight:700;line-height:26px;">${checkIcon}</div></td>
            <td valign="middle" style="padding-left:10px;font-size:15px;font-weight:600;color:${t.primary};line-height:1.35;">${checkText}</td>
          </tr></table>` : ''}
          <div style="margin-top:15px;font-size:14px;line-height:1.65;color:${t.textMuted};max-width:290px;">${description}</div>
        </div>
      </td>
      <td class="stack" valign="middle" align="center" style="padding:18px 40px 24px 10px;width:44%;">${artHtml}</td>
    </tr>
  </table>
</td></tr>`;
}

/* ── Alert Hero (red, for blocked) ────────────────────────────── */

export function buildAlertHero({ title, checkText, description, artHtml }) {
  return `<tr><td style="background:#FEF4F4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td class="px" colspan="2" style="padding:26px 40px 16px 40px;">${headerLogoHtml()}</td></tr>
    <tr>
      <td class="stack px" valign="middle" style="padding:10px 6px 30px 40px;width:56%;font-family:${FONT};">
        <div style="font-size:13px;color:#5B7186;font-weight:500;margin-bottom:7px;">Account Notice</div>
        <div style="border-left:4px solid #EF4444;padding-left:15px;">
          <div style="font-size:25px;line-height:1.18;font-weight:700;color:#14375E;">${title}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:15px;"><tr>
            <td valign="middle"><div style="width:26px;height:26px;border-radius:50%;background:#EF4444;text-align:center;font-family:${FONT};color:#fff;font-size:14px;font-weight:700;line-height:26px;">!</div></td>
            <td valign="middle" style="padding-left:10px;font-size:15px;font-weight:600;color:#EF4444;line-height:1.35;">${checkText}</td>
          </tr></table>
          <div style="margin-top:15px;font-size:14px;line-height:1.65;color:#5B7186;max-width:290px;">${description}</div>
        </div>
      </td>
      <td class="stack" valign="middle" align="center" style="padding:18px 40px 24px 10px;width:44%;">${artHtml}</td>
    </tr>
  </table>
</td></tr>`;
}

/* ── Success Hero (green, for activated) ──────────────────────── */

export function buildSuccessHero({ title, checkText, description, artHtml }) {
  return `<tr><td style="background:#EFFBF3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td class="px" colspan="2" style="padding:26px 40px 16px 40px;">${headerLogoHtml()}</td></tr>
    <tr>
      <td class="stack px" valign="middle" style="padding:10px 6px 30px 40px;width:56%;font-family:${FONT};">
        <div style="font-size:13px;color:#5B7186;font-weight:500;margin-bottom:7px;">Account Notice</div>
        <div style="border-left:4px solid #16A34A;padding-left:15px;">
          <div style="font-size:25px;line-height:1.18;font-weight:700;color:#14375E;">${title}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:15px;"><tr>
            <td valign="middle"><div style="width:26px;height:26px;border-radius:50%;background:#16A34A;text-align:center;font-family:${FONT};color:#fff;font-size:14px;font-weight:700;line-height:26px;">&#10003;</div></td>
            <td valign="middle" style="padding-left:10px;font-size:15px;font-weight:600;color:#16A34A;line-height:1.35;">${checkText}</td>
          </tr></table>
          <div style="margin-top:15px;font-size:14px;line-height:1.65;color:#5B7186;max-width:290px;">${description}</div>
        </div>
      </td>
      <td class="stack" valign="middle" align="center" style="padding:18px 40px 24px 10px;width:44%;">${artHtml}</td>
    </tr>
  </table>
</td></tr>`;
}

/* ── Bold Hero (solid bg for urgent/important/admin) ──────────── */

export function buildBoldHero({ bgColor, badgeText, title, description, artHtml }) {
  return `<tr><td style="background:${bgColor};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td class="px" colspan="2" style="padding:26px 40px 16px 40px;">${headerLogoHtml('#ffffff')}</td></tr>
    <tr>
      <td class="stack px" valign="middle" style="padding:10px 6px 32px 40px;width:58%;font-family:${FONT};">
        <span style="display:inline-block;background:rgba(255,255,255,0.2);color:#fff;font-size:11px;font-weight:700;letter-spacing:1.2px;padding:6px 13px;border-radius:20px;">${badgeText}</span>
        <div style="margin-top:15px;font-size:27px;line-height:1.16;font-weight:700;color:#ffffff;">${title}</div>
        <div style="width:48px;height:3px;background:rgba(255,255,255,0.65);margin:15px 0;"></div>
        <div style="font-size:14px;line-height:1.65;color:rgba(255,255,255,0.94);max-width:320px;">${description}</div>
      </td>
      <td class="stack" valign="middle" align="center" style="padding:20px 40px;width:42%;">${artHtml}</td>
    </tr>
  </table>
</td></tr>`;
}

/* ── Greeting + Message ───────────────────────────────────────── */

export function buildGreeting(name, message, theme) {
  const initial = name.charAt(0).toUpperCase();
  return `<tr><td class="px" style="padding:30px 40px 4px 40px;font-family:${FONT};">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle"><div style="width:42px;height:42px;border-radius:50%;background:${theme.iconBg};text-align:center;line-height:42px;font-size:18px;color:${theme.primary};font-weight:700;">${initial}</div></td>
      <td valign="middle" style="padding-left:14px;"><div style="font-size:18px;font-weight:700;color:${theme.primary};">Hello ${name},</div></td>
    </tr></table>
    <div style="margin-top:15px;font-size:14px;line-height:1.7;color:${theme.textMuted};">${message}</div>
  </td></tr>`;
}

/* ── Row Icons (CSS-only, email-safe) ─────────────────────────── */

function buildRowIconHtml(iconType, color, bg) {
  const base = `width:26px;height:26px;border-radius:7px;background:${bg};`;
  switch (iconType) {
    case 'person':
      return `<div style="${base}text-align:center;padding-top:4px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${color};margin:0 auto;"></div>
        <div style="width:14px;height:6px;border-radius:7px 7px 0 0;background:${color};margin:2px auto 0;"></div>
      </div>`;
    case 'id':
      return `<div style="${base}text-align:center;padding-top:6px;">
        <div style="width:14px;height:10px;border:2px solid ${color};border-radius:3px;margin:0 auto;"></div>
      </div>`;
    case 'calendar':
      return `<div style="${base}text-align:center;padding-top:5px;">
        <div style="width:14px;height:3px;background:${color};border-radius:1px 1px 0 0;margin:0 auto;"></div>
        <div style="width:14px;height:8px;border:1.5px solid ${color};border-top:none;border-radius:0 0 2px 2px;margin:0 auto;"></div>
      </div>`;
    case 'status':
      return `<div style="${base}text-align:center;line-height:26px;font-size:10px;color:${color};">&#9679;</div>`;
    case 'doctor':
      return `<div style="${base}text-align:center;line-height:26px;font-family:${FONT};font-size:16px;font-weight:700;color:${color};">+</div>`;
    case 'flag':
      return `<div style="${base}text-align:center;line-height:26px;font-family:${FONT};font-size:14px;font-weight:700;color:${color};">!</div>`;
    case 'reason':
      return `<div style="${base}text-align:center;line-height:26px;font-family:${FONT};font-size:13px;font-weight:700;color:${color};">?</div>`;
    default:
      return `<div style="${base}"></div>`;
  }
}

/* ── Detail Table ─────────────────────────────────────────────── */

export function buildDetailTable(title, rows, theme) {
  const rowsHtml = rows.map((row, i) => {
    const isLast = i === rows.length - 1;
    const border = isLast ? '' : `border-bottom:1px solid ${theme.borderColor};`;
    let valueHtml;
    if (row.badge) {
      valueHtml = `<span style="display:inline-block;background:${row.badge.bg};color:${row.badge.color};font-family:${FONT};font-size:12px;font-weight:700;padding:5px 13px;border-radius:20px;">${row.badge.text}</span>`;
    } else {
      valueHtml = row.value;
    }
    const iconHtml = row.icon
      ? buildRowIconHtml(row.icon, theme.primary, theme.iconBg)
      : `<div style="width:26px;height:26px;border-radius:7px;background:${theme.iconBg};"></div>`;
    return `<tr>
    <td valign="middle" style="padding:12px 0;${border}"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle">${iconHtml}</td>
      <td valign="middle" style="padding-left:11px;font-family:${FONT};font-size:13px;color:${theme.textMuted};">${row.label}</td>
    </tr></table></td>
    <td valign="middle" align="right" style="padding:12px 0;${border}font-family:${FONT};font-size:14px;font-weight:600;color:${theme.textDark};">${valueHtml}</td>
  </tr>`;
  }).join('');

  return `<tr><td class="px" style="padding:22px 40px 0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${theme.bodyBg};border:1px solid ${theme.borderColor};border-radius:14px;">
      <tr><td style="padding:18px 22px 4px 22px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.8px;color:${theme.primary};">${title}</td></tr>
      <tr><td style="padding:0 22px 14px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table></td></tr>
    </table>
  </td></tr>`;
}

/* ── CTA Button ───────────────────────────────────────────────── */

export function buildCTAButton(text, color) {
  return `<tr><td class="px" align="center" style="padding:28px 40px 4px 40px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${color}" style="border-radius:30px;">
      <a href="#" style="display:inline-block;padding:15px 40px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;border-radius:30px;">${text}</a>
    </td></tr></table>
  </td></tr>`;
}

/* ── Subtitle (below CTA) ────────────────────────────────────── */

export function buildSubtitle(text, theme) {
  return `<tr><td class="px" align="center" style="padding:10px 40px 0;font-family:${FONT};font-size:12px;color:${theme.textMuted};">${text}</td></tr>`;
}

/* ── Centered Text ────────────────────────────────────────────── */

export function buildCenteredText(text, theme) {
  return `<tr><td class="px" align="center" style="padding:20px 40px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${theme.textMuted};">${text}</td></tr>`;
}

/* ── Callout Box (info / warning / error) ─────────────────────── */

export function buildCallout(title, message, type = 'info') {
  const colors = {
    info: { bg: '#EFF6FF', iconBg: '#3B82F6', icon: 'i' },
    warning: { bg: '#FFFBEB', iconBg: '#F59E0B', icon: '!' },
    error: { bg: '#FEF2F2', iconBg: '#EF4444', icon: '!' }
  };
  const c = colors[type] || colors.info;
  return `<tr><td class="px" style="padding:20px 40px 0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg};border-radius:12px;"><tr>
    <td valign="top" style="padding:16px 0 16px 18px;width:42px;"><div style="width:28px;height:28px;border-radius:50%;background:${c.iconBg};color:#fff;text-align:center;line-height:28px;font-family:${FONT};font-weight:700;font-size:15px;">${c.icon}</div></td>
    <td valign="middle" style="padding:16px 18px;font-family:${FONT};"><div style="font-size:14px;font-weight:700;color:#1F2937;">${title}</div><div style="margin-top:3px;font-size:13px;line-height:1.6;color:#5B6573;">${message}</div></td>
  </tr></table></td></tr>`;
}

/* ── OTP Digit Boxes ──────────────────────────────────────────── */

export function buildOtpDigits(otp, theme) {
  const digits = String(otp).split('');
  const cells = digits.map((d, i) => {
    let html = `<td align="center" valign="middle" style="width:46px;height:56px;background:${theme.otpBoxBg};border:2px solid ${theme.otpBoxBorder};border-radius:10px;font-family:${FONT};font-size:27px;font-weight:700;color:${theme.textDark};">${d}</td>`;
    if (i < digits.length - 1) html += `<td style="width:9px;"></td>`;
    return html;
  }).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>${cells}</tr></table>`;
}

/* ── OTP Code Section ─────────────────────────────────────────── */

export function buildOtpSection({ otp, label, minutes, theme }) {
  return `<tr><td class="px" style="padding:14px 40px 0 40px;font-family:${FONT};">
    <div style="font-size:12px;font-weight:700;letter-spacing:.8px;color:${theme.primary};text-align:center;margin-bottom:15px;">${label}</div>
    ${buildOtpDigits(otp, theme)}
    <div style="text-align:center;margin-top:16px;font-size:13px;color:${theme.textMuted};">This code expires in ${minutes} minutes.</div>
  </td></tr>`;
}

/* ── Feature Icon Shapes (CSS-only, 50x50) ────────────────────── */

function buildFeatureIconShape(type, color, bg) {
  const container = `width:50px;height:50px;border-radius:14px;background:${bg};text-align:center;margin:0 auto;`;
  switch (type) {
    case 'calendar':
      return `<div style="${container}padding-top:10px;">
        <div style="width:22px;height:4px;background:${color};border-radius:2px 2px 0 0;margin:0 auto;"></div>
        <div style="width:22px;height:14px;border:2px solid ${color};border-top:none;border-radius:0 0 3px 3px;margin:0 auto;"></div>
      </div>`;
    case 'clipboard':
      return `<div style="${container}padding-top:8px;">
        <div style="width:10px;height:3px;background:${color};border-radius:2px;margin:0 auto;"></div>
        <div style="width:20px;height:20px;border:2px solid ${color};border-radius:3px;margin:2px auto 0;"></div>
      </div>`;
    case 'document':
      return `<div style="${container}padding-top:10px;">
        <div style="width:18px;height:22px;border:2px solid ${color};border-radius:3px;margin:0 auto;"></div>
      </div>`;
    case 'heart':
      return `<div style="${container}line-height:50px;"><span style="font-size:22px;color:${color};">&#9829;</span></div>`;
    default:
      return `<div style="${container}"></div>`;
  }
}

/* ── Feature Icons Row (Welcome template) ─────────────────────── */

export function buildFeatureIcons(features, theme) {
  const cells = features.map(f => {
    const iconHtml = f.iconType
      ? buildFeatureIconShape(f.iconType, theme.primary, theme.iconBg)
      : `<div style="width:50px;height:50px;border-radius:14px;background:${theme.iconBg};text-align:center;line-height:50px;font-size:22px;margin:0 auto;color:${theme.primary};">${f.icon || ''}</div>`;
    return `<td class="stack" valign="top" align="center" width="25%" style="padding:10px 6px;">
    ${iconHtml}
    <div style="margin-top:10px;font-family:${FONT};font-size:12px;font-weight:600;color:${theme.textDark};line-height:1.4;">${f.label}</div>
  </td>`;
  }).join('');

  return `<tr><td class="px" style="padding:20px 30px 2px 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${theme.bodyBg};border:1px solid ${theme.borderColor};border-radius:14px;"><tr><td style="padding:8px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></td></tr></table>
  </td></tr>`;
}

/* ── Steps List ("What's Next?") ──────────────────────────────── */

export function buildStepsList(steps, theme) {
  const cells = steps.map((step, i) => `<td class="stack" valign="top" align="center" width="25%" style="padding:10px 8px;">
    <div style="width:30px;height:30px;border-radius:50%;background:${theme.primary};color:#fff;font-family:${FONT};font-size:14px;font-weight:700;line-height:30px;text-align:center;margin:0 auto;">${i + 1}</div>
    <div style="margin-top:10px;font-family:${FONT};font-size:12px;color:${theme.textMuted};line-height:1.5;">${step}</div>
  </td>`).join('');

  return `<tr><td class="px" style="padding:24px 34px 2px 34px;font-family:${FONT};">
    <div style="font-size:15px;font-weight:700;color:${theme.textDark};margin-bottom:4px;">What&rsquo;s Next?</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
  </td></tr>`;
}

/* ── Admin Content List (icon + title + desc items) ───────────── */

export function buildContentList(items, color) {
  const html = items.map((item, i) => {
    const isLast = i === items.length - 1;
    const border = isLast ? '' : `border-bottom:1px solid rgba(15,23,42,0.06);`;
    return `<tr><td valign="top" style="padding:14px 0;${border}"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td valign="top"><div style="width:30px;height:30px;border-radius:50%;background:${color};"></div></td>
      <td valign="top" style="padding-left:13px;font-family:${FONT};"><div style="font-size:14px;font-weight:700;color:#1F2937;">${item.title}</div><div style="margin-top:3px;font-size:13px;line-height:1.6;color:#5B6573;">${item.description}</div></td>
    </tr></table></td></tr>`;
  }).join('');

  return `<tr><td class="px" style="padding:22px 40px 0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border-radius:14px;"><tr><td style="padding:6px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${html}</table></td></tr></table></td></tr>`;
}

/* ── Need Help Section ────────────────────────────────────────── */

function buildNeedHelp(theme) {
  return `<tr><td class="px" style="padding:26px 40px 6px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${theme.needHelpBg};border-radius:14px;"><tr><td style="padding:18px 22px;font-family:${FONT};">
    <div style="font-size:14px;font-weight:700;color:${theme.primary};">Need Help?</div>
    <div style="margin-top:3px;font-size:13px;color:${theme.textMuted};">Our support team is here to assist you.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr>
      <td style="padding-right:24px;font-size:12px;color:${theme.textDark};line-height:1.6;"><span style="color:${theme.textMuted};">Email</span><br><strong>support@drharsha.com</strong></td>
      <td style="padding-right:24px;font-size:12px;color:${theme.textDark};line-height:1.6;"><span style="color:${theme.textMuted};">Call Us</span><br><strong>+91 98765 43210</strong></td>
      <td style="font-size:12px;color:${theme.textDark};line-height:1.6;"><span style="color:${theme.textMuted};">Hours</span><br><strong>Mon&ndash;Sat &middot; 9 AM&ndash;9 PM</strong></td>
    </tr></table>
  </td></tr></table></td></tr>`;
}

/* ── Footer ───────────────────────────────────────────────────── */

function buildFooter(theme) {
  return `<tr><td style="padding:28px 40px 32px 40px;text-align:center;border-top:1px solid ${theme.borderColor};font-family:${FONT};">
    ${footerLogoHtml()}
    <div style="font-size:13px;font-weight:600;color:${theme.textDark};">Thank you for being a part of Dr Harsha Healthcare.</div>
    <div style="margin-top:5px;font-size:11px;color:${theme.textMuted};">&copy; ${YEAR} Dr Harsha Healthcare. All rights reserved.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:16px auto 0;"><tr>
      <td style="padding:0 5px;"><a href="#" title="Facebook" style="display:inline-block;width:34px;height:34px;border-radius:50%;background:${theme.iconBg};text-align:center;line-height:34px;font-family:${FONT};font-size:11px;font-weight:700;color:${theme.primary};">F</a></td>
      <td style="padding:0 5px;"><a href="#" title="LinkedIn" style="display:inline-block;width:34px;height:34px;border-radius:50%;background:${theme.iconBg};text-align:center;line-height:34px;font-family:${FONT};font-size:11px;font-weight:700;color:${theme.primary};">in</a></td>
      <td style="padding:0 5px;"><a href="#" title="Instagram" style="display:inline-block;width:34px;height:34px;border-radius:50%;background:${theme.iconBg};text-align:center;line-height:34px;font-family:${FONT};font-size:11px;font-weight:700;color:${theme.primary};">IG</a></td>
      <td style="padding:0 5px;"><a href="#" title="WhatsApp" style="display:inline-block;width:34px;height:34px;border-radius:50%;background:${theme.iconBg};text-align:center;line-height:34px;font-family:${FONT};font-size:11px;font-weight:700;color:${theme.primary};">W</a></td>
    </tr></table>
  </td></tr>`;
}

/* ── Unsubscribe Bar ──────────────────────────────────────────── */

function buildUnsubscribeBar(theme) {
  return `<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;"><tr><td style="padding:18px 24px;text-align:center;font-family:${FONT};font-size:11px;color:${theme.textMuted};">
This email was sent by Dr Harsha Healthcare. &nbsp;&middot;&nbsp; <a href="#" style="color:${theme.textMuted};text-decoration:underline;">Manage preferences</a> &nbsp;&middot;&nbsp; <a href="#" style="color:${theme.textMuted};text-decoration:underline;">Unsubscribe</a>
</td></tr></table>`;
}
