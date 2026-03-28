import crypto from "node:crypto";
import { User } from "../Models/User.js";
import { createUserNotification, fetchUserNotifications } from "./notificationController.js";
import { sendAccountUpdateOtpEmail, sendLoginOtpEmail } from "../utils/emailService.js";
import {
  buildAccessToken,
  buildAuthPayload,
  buildRefreshToken,
  createOtpCode,
  getOtpExpiryDate,
  getRefreshExpiryDate,
  hashPlainText,
  verifyRefreshToken
} from "../utils/tokenService.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function emptyOtpState() {
  return {
    codeHash: "",
    expiresAt: null,
    requestedAt: null,
    verifiedTokenHash: "",
    verifiedAt: null
  };
}

function createOtpState(otp) {
  return {
    codeHash: hashPlainText(otp),
    expiresAt: getOtpExpiryDate(),
    requestedAt: new Date(),
    verifiedTokenHash: "",
    verifiedAt: null
  };
}

function getOtpStateValue(otpState) {
  const codeHash = typeof otpState?.codeHash === "string" ? otpState.codeHash : "";
  const expiresAt = otpState?.expiresAt ? new Date(otpState.expiresAt) : null;
  return { codeHash, expiresAt };
}

function getVerifiedStateValue(otpState) {
  const verifiedTokenHash = typeof otpState?.verifiedTokenHash === "string" ? otpState.verifiedTokenHash : "";
  const expiresAt = otpState?.expiresAt ? new Date(otpState.expiresAt) : null;
  return { verifiedTokenHash, expiresAt };
}

function isExpired(dateValue) {
  return !dateValue || dateValue.getTime() < Date.now();
}

function isValidPassword(value) {
  return typeof value === "string" && value.trim().length >= 6;
}

async function loadAuthenticatedUser(req, includePassword = false) {
  const userId = req?.user?._id || req?.user?.id;
  if (!userId) return null;
  const query = User.findById(userId);
  return includePassword ? query.select("+password") : query;
}

function getRefreshTokenFromRequest(req) {
  if (typeof req?.body?.refreshToken === "string" && req.body.refreshToken.trim()) {
    return req.body.refreshToken.trim();
  }
  const header = typeof req?.headers?.authorization === "string" ? req.headers.authorization : "";
  if (header.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  return "";
}

async function persistRefreshToken(user) {
  const refreshToken = buildRefreshToken(user);
  user.refreshToken = {
    tokenHash: hashPlainText(refreshToken),
    expiresAt: getRefreshExpiryDate()
  };
  user.lastLoginAt = new Date();
  await user.save();
  return refreshToken;
}

async function buildAuthenticatedUserPayload(user) {
  return {
    ...buildAuthPayload(user),
    notifications: await fetchUserNotifications(user?._id || user?.id)
  };
}

async function buildSessionResponse(user, message) {
  const accessToken = buildAccessToken(user);
  const refreshToken = await persistRefreshToken(user);
  return {
    message,
    accessToken,
    refreshToken,
    user: await buildAuthenticatedUserPayload(user)
  };
}

export async function requestLoginOtpController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const email = normalizeEmail(req?.body?.email);
    const password = typeof req?.body?.password === "string" ? req.body.password : "";

    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.status === "blocked") return res.status(403).json({ error: "User is blocked" });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const otp = createOtpCode();
    user.loginOtp = createOtpState(otp);
    await user.save();
    await sendLoginOtpEmail({ toEmail: user.email, name: user.name, otp, role: user.role });

    return res.json({
      message: "OTP sent to your email",
      email: user.email,
      role: user.role
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send OTP" });
  }
}

export async function verifyLoginOtpController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const email = normalizeEmail(req?.body?.email);
    const otp = typeof req?.body?.otp === "string" ? req.body.otp.trim() : "";
    if (!email || !otp) return res.status(400).json({ error: "Email and otp are required" });

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).json({ error: "Invalid OTP request" });
    if (user.status === "blocked") return res.status(403).json({ error: "User is blocked" });

    const { codeHash, expiresAt } = getOtpStateValue(user.loginOtp);
    if (!codeHash || isExpired(expiresAt)) {
      return res.status(400).json({ error: "OTP expired. Please request a new OTP." });
    }
    if (hashPlainText(otp) !== codeHash) return res.status(401).json({ error: "Invalid OTP" });

    user.loginOtp = emptyOtpState();
    return res.json(await buildSessionResponse(user, "Login verified successfully"));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "OTP verification failed" });
  }
}

export async function requestForgotPasswordOtpController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const email = normalizeEmail(req?.body?.email);
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await User.findOne({ email });

    if (user && user.status !== "blocked") {
      const otp = createOtpCode();
      user.passwordUpdateOtp = createOtpState(otp);
      await user.save();

      await sendAccountUpdateOtpEmail({
        toEmail: user.email,
        name: user.name,
        otp,
        role: user.role,
        actionType: "password"
      });
    }

    return res.json({ message: "If an account exists for this email, an OTP has been sent." });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send forgot password OTP" });
  }
}

export async function verifyForgotPasswordOtpController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const email = normalizeEmail(req?.body?.email);
    const otp = typeof req?.body?.otp === "string" ? req.body.otp.trim() : "";

    if (!email || !otp) return res.status(400).json({ error: "Email and otp are required" });

    const user = await User.findOne({ email });
    if (!user || user.status === "blocked") {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    const { codeHash, expiresAt } = getOtpStateValue(user.passwordUpdateOtp);
    if (!codeHash || isExpired(expiresAt)) {
      return res.status(400).json({ error: "OTP expired. Please request a new OTP." });
    }
    if (hashPlainText(otp) !== codeHash) return res.status(401).json({ error: "Invalid OTP" });

    const verificationToken = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    user.passwordUpdateOtp = {
      ...emptyOtpState(),
      expiresAt: getOtpExpiryDate(),
      requestedAt: new Date(),
      verifiedTokenHash: hashPlainText(verificationToken),
      verifiedAt: new Date()
    };
    await user.save();

    return res.json({
      message: "OTP verified successfully",
      verificationToken
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to verify forgot password OTP" });
  }
}

export async function completeForgotPasswordController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const email = normalizeEmail(req?.body?.email);
    const verificationToken = typeof req?.body?.verificationToken === "string" ? req.body.verificationToken.trim() : "";
    const newPassword = typeof req?.body?.newPassword === "string" ? req.body.newPassword : "";

    if (!email || !verificationToken || !newPassword) {
      return res.status(400).json({ error: "email, verificationToken, and newPassword are required" });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: "New password must be at least 6 characters long" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user || user.status === "blocked") {
      return res.status(400).json({ error: "Password reset request is invalid or expired" });
    }

    const { verifiedTokenHash, expiresAt } = getVerifiedStateValue(user.passwordUpdateOtp);
    if (!verifiedTokenHash || isExpired(expiresAt)) {
      return res.status(400).json({ error: "Password reset verification expired. Please request a new OTP." });
    }
    if (hashPlainText(verificationToken) !== verifiedTokenHash) {
      return res.status(401).json({ error: "Invalid verification token" });
    }

    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) return res.status(400).json({ error: "New password must be different from current password" });

    user.password = newPassword;
    user.passwordUpdateOtp = emptyOtpState();
    await createUserNotification({
      userId: user._id,
      type: "password_reset",
      title: "Password reset completed",
      message: "Your password was reset successfully from the login page."
    });
    await user.save();

    return res.json({ message: "Password reset successfully" });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to complete password reset" });
  }
}

export async function updateProfileController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const user = await loadAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: "User not found" });

    const name = typeof req?.body?.name === "string" ? req.body.name.trim() : "";
    const phone = typeof req?.body?.phone === "string" ? req.body.phone.trim() : "";

    if (!name) return res.status(400).json({ error: "Name is required" });

    user.name = name;
    user.phone = phone;
    await createUserNotification({
      userId: user._id,
      type: "profile_updated",
      title: "Profile updated",
      message: "Your profile details were updated successfully."
    });

    return res.json(await buildSessionResponse(user, "Profile updated successfully"));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update profile" });
  }
}

export async function requestUpdateEmailOtpController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const password = typeof req?.body?.password === "string" ? req.body.password : "";
    if (!password) return res.status(400).json({ error: "Password is required" });

    const user = await loadAuthenticatedUser(req, true);
    if (!user) return res.status(401).json({ error: "User not found" });

    const isValid = await user.comparePassword(password);
    if (!isValid) return res.status(401).json({ error: "Incorrect password" });

    const otp = createOtpCode();
    user.emailUpdateOtp = createOtpState(otp);
    await user.save();

    await sendAccountUpdateOtpEmail({
      toEmail: user.email,
      name: user.name,
      otp,
      role: user.role,
      actionType: "email"
    });

    return res.json({ message: "OTP sent to your current email address" });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send email update OTP" });
  }
}

export async function verifyUpdateEmailOtpController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const otp = typeof req?.body?.otp === "string" ? req.body.otp.trim() : "";
    if (!otp) return res.status(400).json({ error: "OTP is required" });

    const user = await loadAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: "User not found" });

    const { codeHash, expiresAt } = getOtpStateValue(user.emailUpdateOtp);
    if (!codeHash || isExpired(expiresAt)) {
      return res.status(400).json({ error: "OTP expired. Please request a new OTP." });
    }
    if (hashPlainText(otp) !== codeHash) return res.status(401).json({ error: "Invalid OTP" });

    const verificationToken = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    user.emailUpdateOtp = {
      ...emptyOtpState(),
      expiresAt: getOtpExpiryDate(),
      requestedAt: new Date(),
      verifiedTokenHash: hashPlainText(verificationToken),
      verifiedAt: new Date()
    };
    await user.save();

    return res.json({
      message: "OTP verified successfully",
      verificationToken
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to verify OTP" });
  }
}

export async function completeUpdateEmailController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const verificationToken = typeof req?.body?.verificationToken === "string" ? req.body.verificationToken.trim() : "";
    const newEmail = normalizeEmail(req?.body?.newEmail);

    if (!verificationToken || !newEmail) {
      return res.status(400).json({ error: "verificationToken and newEmail are required" });
    }
    if (!EMAIL_REGEX.test(newEmail)) return res.status(400).json({ error: "Enter a valid email address" });

    const user = await loadAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: "User not found" });
    if (newEmail === user.email) return res.status(400).json({ error: "New email must be different from current email" });

    const existingUser = await User.findOne({ email: newEmail, _id: { $ne: user._id } });
    if (existingUser) return res.status(409).json({ error: "Email already in use" });

    const { verifiedTokenHash, expiresAt } = getVerifiedStateValue(user.emailUpdateOtp);
    if (!verifiedTokenHash || isExpired(expiresAt)) {
      return res.status(400).json({ error: "Email verification expired. Please request a new OTP." });
    }
    if (hashPlainText(verificationToken) !== verifiedTokenHash) {
      return res.status(401).json({ error: "Invalid verification token" });
    }

    const previousEmail = user.email;
    user.email = newEmail;
    user.emailUpdateOtp = emptyOtpState();
    await createUserNotification({
      userId: user._id,
      type: "email_updated",
      title: "Email updated",
      message: `Your account email was updated from ${previousEmail} to ${newEmail}.`
    });

    return res.json(await buildSessionResponse(user, "Email updated successfully"));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update email" });
  }
}

export async function requestUpdatePasswordOtpController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const user = await loadAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: "User not found" });

    const otp = createOtpCode();
    user.passwordUpdateOtp = createOtpState(otp);
    await user.save();

    await sendAccountUpdateOtpEmail({
      toEmail: user.email,
      name: user.name,
      otp,
      role: user.role,
      actionType: "password"
    });

    return res.json({ message: "OTP sent to your current email address" });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send password update OTP" });
  }
}

export async function verifyUpdatePasswordOtpController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const otp = typeof req?.body?.otp === "string" ? req.body.otp.trim() : "";
    if (!otp) return res.status(400).json({ error: "OTP is required" });

    const user = await loadAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: "User not found" });

    const { codeHash, expiresAt } = getOtpStateValue(user.passwordUpdateOtp);
    if (!codeHash || isExpired(expiresAt)) {
      return res.status(400).json({ error: "OTP expired. Please request a new OTP." });
    }
    if (hashPlainText(otp) !== codeHash) return res.status(401).json({ error: "Invalid OTP" });

    const verificationToken = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    user.passwordUpdateOtp = {
      ...emptyOtpState(),
      expiresAt: getOtpExpiryDate(),
      requestedAt: new Date(),
      verifiedTokenHash: hashPlainText(verificationToken),
      verifiedAt: new Date()
    };
    await user.save();

    return res.json({
      message: "OTP verified successfully",
      verificationToken
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to verify OTP" });
  }
}

export async function completeUpdatePasswordWithOtpController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const verificationToken = typeof req?.body?.verificationToken === "string" ? req.body.verificationToken.trim() : "";
    const newPassword = typeof req?.body?.newPassword === "string" ? req.body.newPassword : "";

    if (!verificationToken || !newPassword) {
      return res.status(400).json({ error: "verificationToken and newPassword are required" });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: "New password must be at least 6 characters long" });
    }

    const user = await loadAuthenticatedUser(req, true);
    if (!user) return res.status(401).json({ error: "User not found" });

    const { verifiedTokenHash, expiresAt } = getVerifiedStateValue(user.passwordUpdateOtp);
    if (!verifiedTokenHash || isExpired(expiresAt)) {
      return res.status(400).json({ error: "Password verification expired. Please request a new OTP." });
    }
    if (hashPlainText(verificationToken) !== verifiedTokenHash) {
      return res.status(401).json({ error: "Invalid verification token" });
    }

    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) return res.status(400).json({ error: "New password must be different from current password" });

    user.password = newPassword;
    user.passwordUpdateOtp = emptyOtpState();
    await createUserNotification({
      userId: user._id,
      type: "password_updated",
      title: "Password updated",
      message: "Your password was updated successfully using OTP verification."
    });

    return res.json(await buildSessionResponse(user, "Password updated successfully"));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update password" });
  }
}

export async function completeUpdatePasswordWithOldPasswordController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const oldPassword = typeof req?.body?.oldPassword === "string" ? req.body.oldPassword : "";
    const newPassword = typeof req?.body?.newPassword === "string" ? req.body.newPassword : "";

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "oldPassword and newPassword are required" });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: "New password must be at least 6 characters long" });
    }

    const user = await loadAuthenticatedUser(req, true);
    if (!user) return res.status(401).json({ error: "User not found" });

    const matches = await user.comparePassword(oldPassword);
    if (!matches) return res.status(401).json({ error: "Incorrect old password" });

    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) return res.status(400).json({ error: "New password must be different from current password" });

    user.password = newPassword;
    user.passwordUpdateOtp = emptyOtpState();
    await createUserNotification({
      userId: user._id,
      type: "password_updated",
      title: "Password updated",
      message: "Your password was updated successfully after confirming your old password."
    });

    return res.json(await buildSessionResponse(user, "Password updated successfully"));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update password" });
  }
}

export async function refreshTokenController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) return res.status(400).json({ error: "refreshToken is required" });

    const decoded = verifyRefreshToken(refreshToken);
    const userId = typeof decoded?.sub === "string" ? decoded.sub : "";
    if (!userId) return res.status(401).json({ error: "Invalid refresh token" });

    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ error: "User not found" });
    if (user.status === "blocked") return res.status(403).json({ error: "User is blocked" });

    const storedHash = typeof user?.refreshToken?.tokenHash === "string" ? user.refreshToken.tokenHash : "";
    const storedExpiry = user?.refreshToken?.expiresAt ? new Date(user.refreshToken.expiresAt) : null;
    if (!storedHash || !storedExpiry || storedExpiry.getTime() < Date.now()) {
      return res.status(401).json({ error: "Refresh token expired" });
    }
    if (hashPlainText(refreshToken) !== storedHash) {
      return res.status(401).json({ error: "Refresh token mismatch" });
    }

    const nextAccessToken = buildAccessToken(user);
    const nextRefreshToken = await persistRefreshToken(user);
    await user.save();

    return res.json({
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      user: await buildAuthenticatedUserPayload(user)
    });
  } catch (err) {
    return res.status(401).json({ error: err instanceof Error ? err.message : "Failed to refresh token" });
  }
}

export async function logoutController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) return res.status(400).json({ error: "refreshToken is required" });

    const decoded = verifyRefreshToken(refreshToken);
    const userId = typeof decoded?.sub === "string" ? decoded.sub : "";
    if (!userId) return res.status(200).json({ message: "Logged out" });

    const user = await User.findById(userId);
    if (!user) return res.status(200).json({ message: "Logged out" });

    const storedHash = typeof user?.refreshToken?.tokenHash === "string" ? user.refreshToken.tokenHash : "";
    if (!storedHash || hashPlainText(refreshToken) !== storedHash) {
      return res.status(200).json({ message: "Logged out" });
    }

    user.refreshToken = { tokenHash: "", expiresAt: null };
    await user.save();
    return res.json({ message: "Logged out" });
  } catch {
    return res.status(200).json({ message: "Logged out" });
  }
}

export async function meController(req, res) {
  try {
    return res.json({ user: await buildAuthenticatedUserPayload(req.user) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch user" });
  }
}
