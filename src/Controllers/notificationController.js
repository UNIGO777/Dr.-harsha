import { Notification } from "../Models/Notification.js";

const DEFAULT_NOTIFICATION_LIMIT = 20;
const MAX_NOTIFICATION_LIMIT = 50;

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_NOTIFICATION_LIMIT;
  return Math.min(Math.floor(parsed), MAX_NOTIFICATION_LIMIT);
}

function buildNotificationResponse(notification) {
  if (!notification) return null;

  return {
    id: notification._id.toString(),
    userId: notification.user?.toString?.() || "",
    type: notification.type || "general",
    title: notification.title || "",
    message: notification.message || "",
    metadata: notification.metadata ?? null,
    isRead: Boolean(notification.isRead),
    readAt: notification.readAt || null,
    createdAt: notification.createdAt || null,
    updatedAt: notification.updatedAt || null
  };
}

export async function createUserNotification({
  userId,
  type = "general",
  title,
  message,
  metadata = null,
  createdBy = null
}) {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : userId;
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const normalizedMessage = typeof message === "string" ? message.trim() : "";

  if (!normalizedUserId) throw new Error("userId is required");
  if (!normalizedTitle) throw new Error("title is required");
  if (!normalizedMessage) throw new Error("message is required");

  const notification = await Notification.create({
    user: normalizedUserId,
    type: typeof type === "string" && type.trim() ? type.trim() : "general",
    title: normalizedTitle,
    message: normalizedMessage,
    metadata,
    createdBy: createdBy || null
  });

  return buildNotificationResponse(notification);
}

export async function fetchUserNotifications(userId, options = {}) {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : userId;
  if (!normalizedUserId) return [];

  const limit = normalizeLimit(options.limit);
  const notifications = await Notification.find({ user: normalizedUserId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return notifications.map((notification) => buildNotificationResponse(notification)).filter(Boolean);
}
