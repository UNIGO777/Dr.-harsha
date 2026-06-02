import {
  getRoleTheme, toDisplayName, wrapEmail,
  buildBoldHero, buildBoldHeroArt, buildGreeting, buildCallout
} from './emailLayout.js';

const FONT = "'Poppins','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function toSafe(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function splitParagraphs(value) {
  return toSafe(value, '')
    .split(/\n{2,}/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function buildAdminCustomEmailTemplate({ name, role, subject, message, summary, userNumber, attachmentNames }) {
  const theme = getRoleTheme(role);
  const displayName = toDisplayName(name);
  const roleLabel = theme.label;
  const safeSubject = toSafe(subject, `${roleLabel} update`);
  const safeMessage = toSafe(message, 'There is an update for your account.');
  const safeSummary = toSafe(summary, 'Please review the details below and contact the administrator if you need any help.');
  const paragraphs = splitParagraphs(safeMessage);
  const safeAttachmentNames = Array.isArray(attachmentNames) ? attachmentNames.filter(item => typeof item === 'string' && item.trim()) : [];
  const attachmentsText = safeAttachmentNames.length > 0 ? `Attachments included: ${safeAttachmentNames.join(', ')}` : '';

  const text = [
    `Hello ${displayName},`,
    safeSummary,
    safeMessage,
    `Role: ${roleLabel}`,
    `User ID: ${userNumber ? String(userNumber) : 'Not assigned'}`,
    attachmentsText,
    'This message was sent from the Dr Harsha admin panel.'
  ].filter(Boolean).join('\n\n');

  const artHtml = buildBoldHeroArt({ symbol: '&#9993;' });

  const htmlParagraphs = paragraphs
    .map(p => `<p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:#334155;font-family:${FONT};">${p}</p>`)
    .join('');

  const attachmentsHtml = safeAttachmentNames.length > 0
    ? `<tr><td class="px" style="padding:16px 40px 0 40px;">
        <div style="padding:16px 18px;border-radius:14px;background:#F8FAFC;border:1px solid #E2E8F0;font-family:${FONT};font-size:14px;line-height:1.7;color:#334155;">
          <strong>Attachments:</strong> ${safeAttachmentNames.join(', ')}
        </div>
      </td></tr>`
    : '';

  const bodyContent = [
    buildBoldHero({
      bgColor: '#3B82F6',
      badgeText: 'ANNOUNCEMENT',
      title: safeSubject,
      description: safeSummary,
      artHtml
    }),
    buildGreeting(displayName, 'This is an official message from the Dr Harsha Healthcare administration. Please read it carefully and follow the instructions below.', theme),
    `<tr><td class="px" style="padding:20px 40px 0 40px;">${htmlParagraphs}</td></tr>`,
    attachmentsHtml,
    buildCallout('Please Note', 'Further updates will be shared as soon as they are available.', 'info')
  ].join('');

  const html = wrapEmail({
    bodyContent,
    preheader: safeSummary,
    theme
  });

  return {
    subject: safeSubject,
    text,
    html
  };
}
