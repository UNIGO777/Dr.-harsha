import { Notification } from "../Models/Notification.js";

export async function listPatientNotificationsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = { user: patientId };

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Notification.countDocuments(query)
    ]);

    return res.json({
      notifications: notifications.map((n) => ({
        id: n._id.toString(),
        type: n.type || "general",
        title: n.title,
        message: n.message,
        metadata: n.metadata || null,
        isRead: !!n.isRead,
        readAt: n.readAt,
        createdAt: n.createdAt
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    console.error("listPatientNotificationsController error:", err);
    return res.status(500).json({ error: "Failed to load notifications" });
  }
}

export async function markNotificationReadController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: patientId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    ).lean();

    if (!notification) return res.status(404).json({ error: "Notification not found" });

    return res.json({ success: true });
  } catch (err) {
    console.error("markNotificationReadController error:", err);
    return res.status(500).json({ error: "Failed to update notification" });
  }
}

export async function markAllNotificationsReadController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    await Notification.updateMany(
      { user: patientId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    return res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    console.error("markAllNotificationsReadController error:", err);
    return res.status(500).json({ error: "Failed to update notifications" });
  }
}

export async function getUnreadCountController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const count = await Notification.countDocuments({ user: patientId, isRead: false });

    return res.json({ unreadCount: count });
  } catch (err) {
    console.error("getUnreadCountController error:", err);
    return res.status(500).json({ error: "Failed to get unread count" });
  }
}
