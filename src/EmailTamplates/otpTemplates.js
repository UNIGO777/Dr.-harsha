import {
  getRoleTheme, toDisplayName, wrapEmail,
  buildLightHero, buildHeroArt, buildGreeting,
  buildOtpSection, buildCenteredText
} from './emailLayout.js';

function buildOtpTemplate({
  name, otp, role, expiryMinutes,
  heroTitle, heroCheck, heroDesc, artSymbol,
  greetingMsg, codeLabel, ignoreMsg, subjectLine
}) {
  const theme = getRoleTheme(role);
  const displayName = toDisplayName(name);
  const safeOtp = String(otp || '').trim();
  const minutes = Number.isFinite(Number(expiryMinutes)) ? Number(expiryMinutes) : 10;

  const text = [
    `Hello ${displayName},`,
    greetingMsg,
    `Your one-time password is ${safeOtp}.`,
    `This code expires in ${minutes} minutes.`,
    ignoreMsg,
    '',
    '— Dr Harsha Healthcare'
  ].join('\n');

  const artHtml = buildHeroArt({ symbol: artSymbol, color: theme.primary, lightColor: theme.artBg });

  const bodyContent = [
    buildLightHero({
      theme,
      badgeText: 'Account Security',
      title: heroTitle,
      checkText: heroCheck,
      description: heroDesc,
      artHtml
    }),
    buildGreeting(displayName, greetingMsg, theme),
    buildOtpSection({ otp: safeOtp, label: codeLabel, minutes, theme }),
    buildCenteredText(ignoreMsg, theme)
  ].join('');

  const html = wrapEmail({
    bodyContent,
    preheader: `Your code is ${safeOtp} (expires in ${minutes} minutes).`,
    theme
  });

  return { subject: subjectLine, text, html };
}

export function buildLoginOtpTemplate({ name, otp, role, expiryMinutes }) {
  return buildOtpTemplate({
    name, otp, role, expiryMinutes,
    heroTitle: 'Login Verification',
    heroCheck: "Verify it's really you",
    heroDesc: 'Use the one-time code below to finish signing in securely.',
    artSymbol: '&#10003;',
    greetingMsg: 'We received a request to sign in to your Dr Harsha Healthcare account. Enter the verification code below to continue.',
    codeLabel: 'YOUR LOGIN CODE',
    ignoreMsg: "Didn't try to sign in? You can safely ignore this email &mdash; your account remains secure.",
    subjectLine: `${getRoleTheme(role).badge} &middot; Login OTP`
  });
}

export function buildAccountUpdateOtpTemplate({ name, otp, role, expiryMinutes, actionType }) {
  if (actionType === 'email') {
    return buildOtpTemplate({
      name, otp, role, expiryMinutes,
      heroTitle: 'Confirm Your New Email',
      heroCheck: 'Verify your email change',
      heroDesc: 'Enter the code below to confirm and link your new email address.',
      artSymbol: '@',
      greetingMsg: 'You requested to update the email address on your Dr Harsha Healthcare account. Enter the code below to confirm this change.',
      codeLabel: 'EMAIL VERIFICATION CODE',
      ignoreMsg: "Didn't request this change? Please contact support immediately to secure your account.",
      subjectLine: `${getRoleTheme(role).badge} &middot; Email Change OTP`
    });
  }

  return buildOtpTemplate({
    name, otp, role, expiryMinutes,
    heroTitle: 'Password Change Verification',
    heroCheck: 'Confirm your password change',
    heroDesc: 'Use the one-time code below to confirm your password change request.',
    artSymbol: '&#10045;',
    greetingMsg: 'You requested to change the password on your Dr Harsha Healthcare account. Enter the code below to proceed.',
    codeLabel: 'PASSWORD VERIFICATION CODE',
    ignoreMsg: "Didn't request this change? Please contact support immediately to secure your account.",
    subjectLine: `${getRoleTheme(role).badge} &middot; Password Change OTP`
  });
}
