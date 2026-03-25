import crypto from "node:crypto";
import jwt from "jsonwebtoken";

function requireSecret(value, name) {
  const secret = typeof value === "string" ? value.trim() : "";
  if (!secret) throw new Error(`${name} is not set`);
  return secret;
}

function getAccessSecret() {
  return requireSecret(process.env.JWT_SECRET, "JWT_SECRET");
}

function getRefreshSecret() {
  return requireSecret(process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, "JWT_REFRESH_SECRET");
}

export function createOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function hashPlainText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

export function buildAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, email: user.email },
    getAccessSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );
}

export function buildRefreshToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, type: "refresh" },
    getRefreshSecret(),
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(String(token || ""), getAccessSecret());
}

export function verifyRefreshToken(token) {
  return jwt.verify(String(token || ""), getRefreshSecret());
}

export function getOtpExpiryDate() {
  const minutes = Number(process.env.OTP_EXPIRES_MINUTES || 10);
  return new Date(Date.now() + Math.max(1, minutes) * 60 * 1000);
}

export function getRefreshExpiryDate() {
  const days = Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 7);
  return new Date(Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000);
}

export function buildAuthPayload(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    status: user.status,
    lastLoginAt: user.lastLoginAt || null
  };
}

