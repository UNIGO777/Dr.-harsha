import {
  ROLE_THEMES, toDisplayName, wrapEmail,
  buildLightHero, buildBoldHero, buildHeroArt, buildBoldHeroArt,
  buildGreeting, buildDetailTable, buildCTAButton, buildCallout
} from './emailLayout.js';

function toSafe(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const PRIORITY_MAP = {
  low: 'normal',
  medium: 'normal',
  high: 'important',
  critical: 'urgent'
};

const PRIORITY_BADGES = {
  low: { bg: '#F3F4F6', color: '#6B7280', text: 'Low' },
  medium: { bg: '#FEF3C7', color: '#D97706', text: 'Medium' },
  high: { bg: '#FFEDD5', color: '#EA580C', text: 'High' },
  critical: { bg: '#FEE2E2', color: '#B91C1C', text: 'Urgent' }
};

export function buildAssignmentEmailTemplate({ recipientName, doctorName, title, description, priority, dueAt }) {
  const theme = ROLE_THEMES.doctor;
  const displayName = toDisplayName(recipientName);
  const safeTitle = toSafe(title, 'New Assignment');
  const safeDescription = toSafe(description, 'No additional details provided.');
  const safePriority = priority || 'medium';
  const safeDoctorName = toSafe(doctorName, 'Your Doctor');
  const safeDueAt = dueAt
    ? new Date(dueAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'No due date';
  const style = PRIORITY_MAP[safePriority] || 'normal';
  const priorityBadge = PRIORITY_BADGES[safePriority] || PRIORITY_BADGES.medium;

  const subject = `New Assignment: ${safeTitle}`;

  const text = [
    `Hello ${displayName},`,
    '',
    `You have received a new assignment from Dr. ${safeDoctorName}.`,
    '',
    `Title: ${safeTitle}`,
    `Priority: ${priorityBadge.text}`,
    `Due: ${safeDueAt}`,
    '',
    `Details:`,
    safeDescription,
    '',
    'Please review and complete this assignment at your earliest convenience.',
    '',
    '— Dr Harsha Healthcare'
  ].join('\n');

  const detailRows = [
    { icon: 'person', label: 'Patient Name', value: displayName },
    { icon: 'doctor', label: 'Assigned By', value: `Dr. ${safeDoctorName}` },
    { icon: 'calendar', label: 'Due Date', value: safeDueAt },
    { icon: 'flag', label: 'Priority', badge: priorityBadge }
  ];

  let heroHtml;
  let ctaColor;
  let calloutHtml = '';

  if (style === 'urgent') {
    const artHtml = buildBoldHeroArt({ symbol: '!' });
    heroHtml = buildBoldHero({
      bgColor: '#EF4444',
      badgeText: 'URGENT',
      title: `Urgent: ${safeTitle}`,
      description: 'A patient requires your attention. Please review and respond as soon as possible.',
      artHtml
    });
    ctaColor = '#EF4444';
    calloutHtml = buildCallout(
      'Action Required',
      'Please acknowledge this assignment within 30 minutes, or it may be escalated to another clinician.',
      'error'
    );
  } else if (style === 'important') {
    const artHtml = buildBoldHeroArt({ symbol: '!' });
    heroHtml = buildBoldHero({
      bgColor: '#F59E0B',
      badgeText: 'IMPORTANT',
      title: `Important: ${safeTitle}`,
      description: 'You have a new priority assignment. Please review the details and take action.',
      artHtml
    });
    ctaColor = '#F59E0B';
    calloutHtml = buildCallout(
      'Priority Notice',
      'This assignment is marked as important. Please review and acknowledge soon.',
      'warning'
    );
  } else {
    const artHtml = buildHeroArt({ symbol: '&#10003;', color: theme.primary, lightColor: theme.artBg });
    heroHtml = buildLightHero({
      theme,
      badgeText: 'Care Team',
      title: 'New Patient Assignment',
      checkText: 'A patient has been assigned to you',
      description: 'Please review the assignment details and confirm your availability.',
      artHtml
    });
    ctaColor = theme.primary;
  }

  const bodyContent = [
    heroHtml,
    buildGreeting(displayName, `You have a new patient assignment in your Dr Harsha Healthcare care queue. The details are below.`, theme),
    buildDetailTable('ASSIGNMENT DETAILS', detailRows, theme),
    buildCTAButton('View Assignment', ctaColor),
    calloutHtml
  ].join('');

  const html = wrapEmail({
    bodyContent,
    preheader: `New assignment: ${safeTitle}.`,
    theme
  });

  return { subject, text, html };
}
