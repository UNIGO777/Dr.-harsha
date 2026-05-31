import { Message, Conversation } from "../Models/Message.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { Notification } from "../Models/Notification.js";

export async function listConversationsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const conversations = await Conversation.find({ patient: patientId, status: "active" })
      .populate("careTeamMember", "name email phone")
      .sort({ lastMessageAt: -1 })
      .lean();

    return res.json({
      conversations: conversations.map((c) => ({
        id: c._id.toString(),
        careTeamMember: c.careTeamMember
          ? { id: c.careTeamMember._id.toString(), name: c.careTeamMember.name, phone: c.careTeamMember.phone || "" }
          : null,
        careTeamRole: c.careTeamRole,
        subject: c.subject,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        patientUnreadCount: c.patientUnreadCount || 0,
        createdAt: c.createdAt
      }))
    });
  } catch (err) {
    console.error("listConversationsController error:", err);
    return res.status(500).json({ error: "Failed to load conversations" });
  }
}

export async function getConversationMessagesController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const conversation = await Conversation.findOne({ _id: conversationId, patient: patientId }).lean();
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    const [messages, total] = await Promise.all([
      Message.find({ conversation: conversationId })
        .populate("sender", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Message.countDocuments({ conversation: conversationId })
    ]);

    // Mark unread messages as read
    await Message.updateMany(
      { conversation: conversationId, sender: { $ne: patientId }, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    await Conversation.updateOne(
      { _id: conversationId },
      { $set: { patientUnreadCount: 0 } }
    );

    return res.json({
      messages: messages.reverse().map((m) => ({
        id: m._id.toString(),
        sender: m.sender ? { id: m.sender._id.toString(), name: m.sender.name } : null,
        senderRole: m.senderRole,
        content: m.content,
        messageType: m.messageType,
        fileAttachment: m.messageType === "file" ? m.fileAttachment : null,
        isRead: m.isRead,
        createdAt: m.createdAt
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    console.error("getConversationMessagesController error:", err);
    return res.status(500).json({ error: "Failed to load messages" });
  }
}

export async function sendMessageController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { conversationId, careTeamMemberId, subject, content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    let conversation;

    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, patient: patientId });
      if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    } else {
      // Start new conversation
      if (!careTeamMemberId) {
        // Default to assigned nurse
        const profile = await PatientProfile.findOne({ user: patientId }).lean();
        const defaultNurse = profile?.assignedNurses?.[0];
        if (!defaultNurse) {
          return res.status(400).json({ error: "No care team member assigned. Please contact the clinic directly." });
        }
        conversation = await Conversation.create({
          patient: patientId,
          careTeamMember: defaultNurse,
          careTeamRole: "nurse",
          subject: (subject || "General").trim()
        });
      } else {
        const profile = await PatientProfile.findOne({ user: patientId }).lean();
        const isNurse = (profile?.assignedNurses || []).some((n) => n.toString() === careTeamMemberId);
        const isDoctor = (profile?.assignedDoctors || []).some((d) => d.toString() === careTeamMemberId);

        if (!isNurse && !isDoctor) {
          return res.status(400).json({ error: "You can only message your assigned care team" });
        }

        // Check if conversation already exists
        conversation = await Conversation.findOne({
          patient: patientId,
          careTeamMember: careTeamMemberId,
          status: "active"
        });

        if (!conversation) {
          conversation = await Conversation.create({
            patient: patientId,
            careTeamMember: careTeamMemberId,
            careTeamRole: isDoctor ? "doctor" : "nurse",
            subject: (subject || "General").trim()
          });
        }
      }
    }

    const message = await Message.create({
      conversation: conversation._id,
      sender: patientId,
      senderRole: "patient",
      content: content.trim(),
      messageType: "text"
    });

    // Update conversation
    await Conversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          lastMessageAt: message.createdAt,
          lastMessagePreview: content.trim().slice(0, 100)
        },
        $inc: { careTeamUnreadCount: 1 }
      }
    );

    // Notify care team member
    await Notification.create({
      user: conversation.careTeamMember,
      type: "message_received",
      title: "New Message from Patient",
      message: `${req.user.name || "Patient"}: ${content.trim().slice(0, 80)}`,
      metadata: { patientId, conversationId: conversation._id.toString() },
      createdBy: patientId
    });

    return res.status(201).json({
      success: true,
      message: {
        id: message._id.toString(),
        content: message.content,
        senderRole: "patient",
        createdAt: message.createdAt
      },
      conversationId: conversation._id.toString()
    });
  } catch (err) {
    console.error("sendMessageController error:", err);
    return res.status(500).json({ error: "Failed to send message" });
  }
}
