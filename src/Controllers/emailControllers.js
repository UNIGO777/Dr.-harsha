import { BroadcastHistory } from "../Models/BroadcastHistory.js";
import { User } from "../Models/User.js";
import { buildPromptSections, generateGptJson } from "../utils/gptService.js";
import { sendAdminCustomEmail } from "../utils/emailService.js";

const EMAIL_ATTACHMENT_LIMIT = 5;
const EMAIL_ATTACHMENT_SIZE_LIMIT = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);

function buildUserResponse(user) {
  return {
    id: user._id.toString(),
    userNumber: user.userNumber ?? null,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || null
  };
}

function buildBroadcastRecipientResponse(user) {
  if (!user?._id) return null;

  return {
    id: user._id.toString(),
    userNumber: user.userNumber ?? null,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || "",
    status: user.status
  };
}

function buildBroadcastAudienceSummary(users) {
  const normalizedUsers = Array.isArray(users) ? users : [];

  return normalizedUsers.reduce(
    (summary, user) => {
      summary.total += 1;
      if (user?.role === "doctor") summary.doctors += 1;
      if (user?.role === "nurse") summary.nurses += 1;
      if (user?.role === "patient") summary.patients += 1;
      return summary;
    },
    {
      total: 0,
      doctors: 0,
      nurses: 0,
      patients: 0
    }
  );
}

function buildBroadcastHistoryResponse(history) {
  if (!history?._id) return null;

  return {
    id: history._id.toString(),
    sender: history?.sender?.user
      ? {
          id: history.sender.user.toString(),
          userNumber: history.sender.userNumber ?? null,
          name: history.sender.name,
          email: history.sender.email,
          role: history.sender.role
        }
      : null,
    subject: history.subject,
    summary: history.summary || "",
    message: history.message,
    attachments: Array.isArray(history.attachments)
      ? history.attachments.map((attachment) => ({
          filename: attachment.filename,
          contentType: attachment.contentType || ""
        }))
      : [],
    requestedCount: history.requestedCount || 0,
    sentCount: history.sentCount || 0,
    failedCount: history.failedCount || 0,
    audience: history.audience || { total: 0, doctors: 0, nurses: 0, patients: 0 },
    recipients: Array.isArray(history.recipients)
      ? history.recipients.map((recipient) => ({
          id: recipient?.user ? recipient.user.toString() : null,
          userNumber: recipient?.userNumber ?? null,
          name: recipient?.name || "",
          email: recipient?.email || "",
          role: recipient?.role || "",
          status: recipient?.status || "sent",
          reason: recipient?.reason || ""
        }))
      : [],
    createdAt: history.createdAt,
    updatedAt: history.updatedAt
  };
}

function matchesBroadcastRecipientSearch(user, search) {
  const normalizedSearch = typeof search === "string" ? search.trim().toLowerCase() : "";
  if (!normalizedSearch) return true;

  const haystacks = [user?.name, user?.email, user?.phone, user?.role, user?.userNumber != null ? String(user.userNumber) : ""];
  return haystacks.some((value) => typeof value === "string" && value.toLowerCase().includes(normalizedSearch));
}

function normalizeTextField(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseIdArrayField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  const normalizedValue = value.trim();
  if (!normalizedValue) return [];

  try {
    const parsedValue = JSON.parse(normalizedValue);
    return Array.isArray(parsedValue) ? parsedValue : [normalizedValue];
  } catch {
    return normalizedValue.split(",");
  }
}

function normalizeIdArray(value) {
  const values = parseIdArrayField(value);

  return Array.from(
    new Set(
      values
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  );
}

function getEmailAttachments(req) {
  const files = Array.isArray(req?.files) ? req.files : [];
  return files.map((file) => ({
    filename: file.originalname,
    content: file.buffer,
    contentType: file.mimetype
  }));
}

async function generateAiEmailDraft({ user, prompt, tone, extraInstructions }) {
  const roleLabel = typeof user?.role === "string" ? user.role.replace(/_/g, " ") : "user";
  const promptText = normalizeTextField(prompt);
  if (!promptText) {
    throw new Error("prompt is required");
  }

  const system = [
    "You write professional hospital admin emails.",
    "Return only valid JSON with keys subject, summary, message.",
    "summary must be one short sentence.",
    "message must be plain text with paragraphs separated by blank lines.",
    "Keep the tone clear, polite, and suitable for medical administration."
  ].join(" ");

  const userPrompt = buildPromptSections([
    { label: "Recipient name", value: user?.name || "User" },
    { label: "Recipient role", value: roleLabel },
    { label: "Recipient email", value: user?.email || "Not available" },
    { label: "Recipient user ID", value: user?.userNumber ? String(user.userNumber) : "Not assigned" },
    { label: "Requested tone", value: normalizeTextField(tone) || "professional" },
    normalizeTextField(extraInstructions) ? { label: "Extra instructions", value: normalizeTextField(extraInstructions) } : null,
    { label: "Request", value: promptText }
  ]);

  const response = await generateGptJson({
    systemPrompt: system,
    userPrompt,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.6
  });

  const subject = normalizeTextField(response.data.subject) || "Account update";
  const summary = normalizeTextField(response.data.summary) || "Please review this important update from the Dr Harsha admin panel.";
  const message = normalizeTextField(response.data.message) || "Hello,\n\nPlease review this important update.\n\nThank you.";

  return { subject, summary, message };
}

async function generateAiBroadcastEmailDraft({ sender, recipients, prompt, tone, extraInstructions }) {
  const promptText = normalizeTextField(prompt);
  if (!promptText) {
    throw new Error("prompt is required");
  }

  const normalizedRecipients = Array.isArray(recipients) ? recipients : [];
  const audienceSummary = buildBroadcastAudienceSummary(normalizedRecipients);
  const audiencePreview = normalizedRecipients
    .slice(0, 8)
    .map((recipient) => `${recipient.name} (${recipient.role})`)
    .join(", ");

  const system = [
    "You write professional hospital broadcast emails.",
    "Return only valid JSON with keys subject, summary, message.",
    "summary must be one short sentence.",
    "message must be plain text with paragraphs separated by blank lines.",
    "Keep the tone clear, polite, and suitable for medical administration.",
    "Make the email work for multiple recipients across different hospital roles."
  ].join(" ");

  const userPrompt = buildPromptSections([
    { label: "Sender name", value: sender?.name || "Hospital team" },
    { label: "Sender role", value: sender?.role ? String(sender.role).replace(/_/g, " ") : "hospital team" },
    { label: "Requested tone", value: normalizeTextField(tone) || "professional" },
    { label: "Audience total", value: String(audienceSummary.total) },
    { label: "Audience doctors", value: String(audienceSummary.doctors) },
    { label: "Audience nurses", value: String(audienceSummary.nurses) },
    { label: "Audience patients", value: String(audienceSummary.patients) },
    audiencePreview ? { label: "Audience preview", value: audiencePreview } : null,
    normalizeTextField(extraInstructions) ? { label: "Extra instructions", value: normalizeTextField(extraInstructions) } : null,
    { label: "Request", value: promptText }
  ]);

  const response = await generateGptJson({
    systemPrompt: system,
    userPrompt,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.6
  });

  const subject = normalizeTextField(response.data.subject) || "Important update";
  const summary = normalizeTextField(response.data.summary) || "Please review this important update from the Dr Harsha team.";
  const message = normalizeTextField(response.data.message) || "Hello,\n\nPlease review this important update.\n\nThank you.";

  return { subject, summary, message };
}

export async function listBroadcastRecipientsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const requesterId = req?.user?._id?.toString?.() || "";
    const search = typeof req?.query?.search === "string" ? req.query.search.trim() : "";

    const users = await User.find({
      role: { $in: ["doctor", "nurse", "patient"] },
      ...(requesterId ? { _id: { $ne: requesterId } } : {})
    })
      .sort({ role: 1, name: 1, createdAt: -1 })
      .lean();

    const recipients = users
      .map((user) => buildBroadcastRecipientResponse(user))
      .filter(Boolean)
      .filter((user) => matchesBroadcastRecipientSearch(user, search));

    return res.json({
      users: recipients,
      summary: buildBroadcastAudienceSummary(recipients)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch broadcast recipients";
    return res.status(500).json({ error: message });
  }
}

export async function listBroadcastHistoryController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const requesterId = req?.user?._id?.toString?.() || "";
    const requesterRole = typeof req?.user?.role === "string" ? req.user.role : "";

    const histories = await BroadcastHistory.find(
      requesterRole === "super_admin" ? {} : { "sender.user": requesterId }
    )
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const items = histories.map((history) => buildBroadcastHistoryResponse(history)).filter(Boolean);

    return res.json({
      history: items,
      summary: {
        total: items.length,
        sent: items.reduce((count, item) => count + (item.sentCount || 0), 0),
        failed: items.reduce((count, item) => count + (item.failedCount || 0), 0)
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch broadcast history";
    return res.status(500).json({ error: message });
  }
}

export async function sendUserEmailController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const userId = typeof req?.params?.userId === "string" ? req.params.userId.trim() : "";
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const subject = normalizeTextField(req?.body?.subject);
    const message = normalizeTextField(req?.body?.message);
    const summary = normalizeTextField(req?.body?.summary);

    if (!subject) return res.status(400).json({ error: "subject is required" });
    if (!message) return res.status(400).json({ error: "message is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.email) return res.status(400).json({ error: "Selected user does not have an email address" });

    const attachments = getEmailAttachments(req);

    await sendAdminCustomEmail({
      toEmail: user.email,
      name: user.name,
      role: user.role,
      subject,
      message,
      summary,
      userNumber: user.userNumber,
      attachments
    });

    return res.json({
      message: attachments.length > 0 ? `Email sent successfully with ${attachments.length} attachment${attachments.length > 1 ? "s" : ""}.` : "Email sent successfully.",
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType
      })),
      user: buildUserResponse(user)
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send email" });
  }
}

export async function sendBroadcastEmailController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const requesterId = req?.user?._id?.toString?.() || "";
    const recipientIds = normalizeIdArray(req?.body?.recipientIds);
    const subject = normalizeTextField(req?.body?.subject);
    const message = normalizeTextField(req?.body?.message);
    const summary = normalizeTextField(req?.body?.summary);

    if (recipientIds.length === 0) {
      return res.status(400).json({ error: "Select at least one recipient" });
    }
    if (!subject) return res.status(400).json({ error: "subject is required" });
    if (!message) return res.status(400).json({ error: "message is required" });

    const recipients = await User.find({
      _id: { $in: recipientIds },
      role: { $in: ["doctor", "nurse", "patient"] },
      ...(requesterId ? { _id: { $in: recipientIds, $ne: requesterId } } : {})
    }).lean();

    const recipientsById = new Map(recipients.map((user) => [user._id.toString(), user]));
    const orderedRecipients = recipientIds.map((recipientId) => recipientsById.get(recipientId)).filter(Boolean);

    if (orderedRecipients.length !== recipientIds.length) {
      return res.status(400).json({ error: "One or more selected recipients are invalid" });
    }

    const attachments = getEmailAttachments(req);
    const results = await Promise.allSettled(
      orderedRecipients.map((recipient) =>
        sendAdminCustomEmail({
          toEmail: recipient.email,
          name: recipient.name,
          role: recipient.role,
          subject,
          message,
          summary,
          userNumber: recipient.userNumber,
          attachments
        })
      )
    );

    const sent = [];
    const failed = [];

    results.forEach((result, index) => {
      const recipient = orderedRecipients[index];
      const recipientResponse = buildBroadcastRecipientResponse(recipient);

      if (result.status === "fulfilled") {
        sent.push(recipientResponse);
        return;
      }

      failed.push({
        ...recipientResponse,
        reason: result.reason instanceof Error ? result.reason.message : "Failed to send email"
      });
    });

    const messageText =
      failed.length === 0
        ? `Broadcast email sent successfully to ${sent.length} recipient${sent.length === 1 ? "" : "s"}.`
        : `Broadcast email sent to ${sent.length} recipient${sent.length === 1 ? "" : "s"} with ${failed.length} failure${failed.length === 1 ? "" : "s"}.`;

    const audience = buildBroadcastAudienceSummary(orderedRecipients);
    const historyRecipients = [
      ...sent.map((recipient) => ({
        user: recipient?.id || null,
        userNumber: recipient?.userNumber ?? null,
        name: recipient?.name || "",
        email: recipient?.email || "",
        role: recipient?.role || "",
        status: "sent",
        reason: ""
      })),
      ...failed.map((recipient) => ({
        user: recipient?.id || null,
        userNumber: recipient?.userNumber ?? null,
        name: recipient?.name || "",
        email: recipient?.email || "",
        role: recipient?.role || "",
        status: "failed",
        reason: recipient?.reason || ""
      }))
    ];

    const savedHistory = await BroadcastHistory.create({
      sender: {
        user: req.user._id,
        userNumber: req.user.userNumber ?? null,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      subject,
      summary,
      message,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType
      })),
      requestedCount: recipientIds.length,
      sentCount: sent.length,
      failedCount: failed.length,
      audience,
      recipients: historyRecipients
    });

    return res.json({
      message: messageText,
      summary: {
        requested: recipientIds.length,
        sent: sent.length,
        failed: failed.length
      },
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType
      })),
      history: buildBroadcastHistoryResponse(savedHistory),
      sent,
      failed
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send broadcast email" });
  }
}

export async function generateBroadcastEmailDraftController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const prompt = normalizeTextField(req?.body?.prompt);
    const tone = normalizeTextField(req?.body?.tone);
    const extraInstructions = normalizeTextField(req?.body?.extraInstructions);
    const requesterId = req?.user?._id?.toString?.() || "";
    const recipientIds = normalizeIdArray(req?.body?.recipientIds);

    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const recipients = recipientIds.length
      ? await User.find({
          _id: { $in: recipientIds },
          role: { $in: ["doctor", "nurse", "patient"] },
          ...(requesterId ? { _id: { $in: recipientIds, $ne: requesterId } } : {})
        }).lean()
      : [];

    if (recipientIds.length > 0 && recipients.length !== recipientIds.length) {
      return res.status(400).json({ error: "One or more selected recipients are invalid" });
    }

    const recipientsById = new Map(recipients.map((user) => [user._id.toString(), user]));
    const orderedRecipients = recipientIds.map((recipientId) => recipientsById.get(recipientId)).filter(Boolean);
    const draft = await generateAiBroadcastEmailDraft({
      sender: req.user,
      recipients: orderedRecipients,
      prompt,
      tone,
      extraInstructions
    });

    return res.json({
      message: "AI broadcast email draft generated successfully.",
      draft,
      audience: buildBroadcastAudienceSummary(orderedRecipients)
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate broadcast email draft" });
  }
}

export async function generateUserEmailDraftController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const userId = typeof req?.params?.userId === "string" ? req.params.userId.trim() : "";
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const prompt = normalizeTextField(req?.body?.prompt);
    const tone = normalizeTextField(req?.body?.tone);
    const extraInstructions = normalizeTextField(req?.body?.extraInstructions);

    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const draft = await generateAiEmailDraft({ user, prompt, tone, extraInstructions });

    return res.json({
      message: "AI email draft generated successfully.",
      draft,
      user: buildUserResponse(user)
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate email draft" });
  }
}

export function validateUserEmailAttachments(req, res, next) {
  const files = Array.isArray(req?.files) ? req.files : [];
  if (files.length > EMAIL_ATTACHMENT_LIMIT) {
    return res.status(400).json({ error: `You can attach up to ${EMAIL_ATTACHMENT_LIMIT} files.` });
  }

  for (const file of files) {
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: `Unsupported attachment type: ${file.originalname}` });
    }
    if (typeof file.size === "number" && file.size > EMAIL_ATTACHMENT_SIZE_LIMIT) {
      return res.status(400).json({ error: `${file.originalname} exceeds the 10 MB file size limit.` });
    }
  }

  return next();
}
