import {
  getRoleTheme, toDisplayName, wrapEmail,
  buildLightHero, buildAlertHero, buildSuccessHero,
  buildHeroArt, buildGreeting, buildDetailTable,
  buildCTAButton, buildSubtitle, buildCallout,
  buildFeatureIcons, buildStepsList
} from './emailLayout.js';

function toSafe(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/* ── User Onboarding / Welcome ────────────────────────────────── */

export function buildUserOnboardingTemplate({ name, role, email, phone, userNumber }) {
  const theme = getRoleTheme(role);
  const displayName = toDisplayName(name);
  const roleLabel = theme.label;

  const text = [
    `Hello ${displayName},`,
    `Your ${roleLabel.toLowerCase()} account has been successfully created.`,
    `You can now access a range of healthcare services with ease.`,
    '',
    `${roleLabel} Name: ${displayName}`,
    `${roleLabel} ID: ${userNumber || 'Not assigned'}`,
    `Email: ${email || 'Not available'}`,
    `Phone: ${phone || 'Not available'}`,
    `Account Status: Active`,
    '',
    'Please keep your user ID safe for future communication and verification.',
    '',
    '— Dr Harsha Healthcare'
  ].join('\n');

  const artHtml = buildHeroArt({ symbol: '&#10003;', color: theme.primary, lightColor: theme.artBg });

  const features = [
    { iconType: 'calendar', label: 'Book Appointments Online' },
    { iconType: 'clipboard', label: 'Access Your Health Reports' },
    { iconType: 'document', label: 'View Your Prescriptions' },
    { iconType: 'heart', label: 'Track Your Health Journey' }
  ];

  const steps = [
    'Complete your health profile',
    'Upload previous medical reports',
    'Schedule your first consultation',
    'Start your journey to better health'
  ];

  const detailRows = [
    { icon: 'person', label: `${roleLabel} Name`, value: displayName },
    { icon: 'id', label: `${roleLabel} ID`, value: userNumber ? String(userNumber) : 'Not assigned' },
    { icon: 'calendar', label: 'Registered On', value: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) },
    { icon: 'status', label: 'Account Status', badge: { bg: '#DCFCE7', color: '#15803D', text: 'Active' } }
  ];

  const bodyContent = [
    buildLightHero({
      theme,
      badgeText: 'Welcome to',
      title: 'Dr Harsha Healthcare',
      checkText: 'Your registration has been completed successfully.',
      description: "We're delighted to have you as part of our healthcare community.",
      artHtml
    }),
    buildFeatureIcons(features, theme),
    buildGreeting(displayName, `Your ${roleLabel.toLowerCase()} account has been successfully created. You can now access a range of healthcare services with ease.`, theme),
    buildDetailTable('YOUR ACCOUNT DETAILS', detailRows, theme),
    buildCTAButton(`Access ${roleLabel} Portal`, theme.primary),
    buildSubtitle('Use your registered email and password to log in.', theme),
    buildStepsList(steps, theme)
  ].join('');

  const html = wrapEmail({
    bodyContent,
    preheader: `Your ${roleLabel.toLowerCase()} account is ready — welcome aboard!`,
    theme
  });

  return {
    subject: `${roleLabel} onboarding completed`,
    text,
    html
  };
}

/* ── User Blocked ─────────────────────────────────────────────── */

export function buildUserBlockedTemplate({ name, role, email, phone, userNumber }) {
  const theme = getRoleTheme(role);
  const displayName = toDisplayName(name);
  const roleLabel = theme.label;

  const text = [
    `Hello ${displayName},`,
    `Your ${roleLabel.toLowerCase()} account has been temporarily suspended.`,
    `During this time you won't be able to sign in or book services.`,
    '',
    `Account Status: Blocked`,
    `Effective: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    `${roleLabel} ID: ${userNumber || 'Not assigned'}`,
    '',
    'If you believe this was a mistake, please contact the hospital administrator.',
    '',
    '— Dr Harsha Healthcare'
  ].join('\n');

  const artHtml = buildHeroArt({ symbol: '!', color: '#EF4444', lightColor: '#FEE2E2' });

  const detailRows = [
    { icon: 'status', label: 'Account Status', badge: { bg: '#FEE2E2', color: '#B91C1C', text: 'Blocked' } },
    { icon: 'calendar', label: 'Effective', value: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) },
    { icon: 'reason', label: 'Reason', value: 'Pending verification' }
  ];

  const bodyContent = [
    buildAlertHero({
      title: 'Account Access Suspended',
      checkText: 'Your account has been temporarily blocked',
      description: 'Access to your Dr Harsha Healthcare account has been paused. See the details below.',
      artHtml
    }),
    buildGreeting(displayName, "We're writing to let you know that your account has been temporarily suspended. During this time you won't be able to sign in or book services.", theme),
    buildDetailTable('ACCOUNT STATUS', detailRows, theme),
    buildCallout('Need this resolved?', 'Contact our support team and we\'ll help restore your access as quickly as possible.', 'error'),
    buildCTAButton('Contact Support', '#EF4444')
  ].join('');

  const html = wrapEmail({
    bodyContent,
    preheader: 'Your account has been temporarily blocked.',
    theme
  });

  return {
    subject: `${roleLabel} account blocked`,
    text,
    html
  };
}

/* ── User Activated ───────────────────────────────────────────── */

export function buildUserActiveTemplate({ name, role, email, phone, userNumber }) {
  const theme = getRoleTheme(role);
  const displayName = toDisplayName(name);
  const roleLabel = theme.label;

  const text = [
    `Hello ${displayName},`,
    `Your ${roleLabel.toLowerCase()} account has been reviewed and activated.`,
    `You can now sign in and access all healthcare services again.`,
    '',
    `Account Status: Active`,
    `Activated On: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    `${roleLabel} ID: ${userNumber || 'Not assigned'}`,
    '',
    'Welcome back — we\'re glad to have you with us.',
    '',
    '— Dr Harsha Healthcare'
  ].join('\n');

  const artHtml = buildHeroArt({ symbol: '&#10003;', color: '#16A34A', lightColor: '#DCFCE7' });

  const detailRows = [
    { icon: 'status', label: 'Account Status', badge: { bg: '#DCFCE7', color: '#15803D', text: 'Active' } },
    { icon: 'calendar', label: 'Activated On', value: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) },
    { icon: 'id', label: `${roleLabel} ID`, value: userNumber ? String(userNumber) : 'Not assigned' }
  ];

  const bodyContent = [
    buildSuccessHero({
      title: 'Account Activated',
      checkText: 'Your account is now active',
      description: 'Good news — your Dr Harsha Healthcare account has been activated and is ready to use.',
      artHtml
    }),
    buildGreeting(displayName, 'Your account has been reviewed and activated. You can now sign in and access all healthcare services again.', theme),
    buildDetailTable('ACCOUNT STATUS', detailRows, theme),
    buildCTAButton('Access Your Portal', theme.primary),
    buildSubtitle("Welcome back — we're glad to have you with us.", theme)
  ].join('');

  const html = wrapEmail({
    bodyContent,
    preheader: 'Your account is now active.',
    theme
  });

  return {
    subject: `${roleLabel} account activated`,
    text,
    html
  };
}
