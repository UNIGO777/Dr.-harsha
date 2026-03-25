import { User } from "../Models/User.js";
import { sendLoginOtpEmail } from "../utils/emailService.js";
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

export async function requestLoginOtpController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const email = typeof req?.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req?.body?.password === "string" ? req.body.password : "";

    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.status === "blocked") return res.status(403).json({ error: "User is blocked" });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const otp = createOtpCode();
    user.loginOtp = {
      codeHash: hashPlainText(otp),
      expiresAt: getOtpExpiryDate(),
      requestedAt: new Date()
    };
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

    const email = typeof req?.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const otp = typeof req?.body?.otp === "string" ? req.body.otp.trim() : "";
    if (!email || !otp) return res.status(400).json({ error: "Email and otp are required" });

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).json({ error: "Invalid OTP request" });
    if (user.status === "blocked") return res.status(403).json({ error: "User is blocked" });

    const expectedHash = typeof user?.loginOtp?.codeHash === "string" ? user.loginOtp.codeHash : "";
    const expiresAt = user?.loginOtp?.expiresAt ? new Date(user.loginOtp.expiresAt) : null;
    if (!expectedHash || !expiresAt || expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "OTP expired. Please request a new OTP." });
    }
    if (hashPlainText(otp) !== expectedHash) return res.status(401).json({ error: "Invalid OTP" });

    const accessToken = buildAccessToken(user);
    const refreshToken = await persistRefreshToken(user);
    user.loginOtp = { codeHash: "", expiresAt: null, requestedAt: null };
    await user.save();

    return res.json({
      accessToken,
      refreshToken,
      user: buildAuthPayload(user)
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "OTP verification failed" });
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
      user: buildAuthPayload(user)
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
    return res.json({ user: buildAuthPayload(req.user) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch user" });
  }
}
