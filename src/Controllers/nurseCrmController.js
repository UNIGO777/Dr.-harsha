import {
  CrmTask,
  CRM_TASK_CATEGORY_ENUM,
  CRM_TASK_OUTCOME_ENUM,
  CRM_TASK_PRIORITY_ENUM,
  CRM_TASK_STATUS_ENUM
} from "../Models/CrmTask.js";
import { NurseProfile } from "../Models/NurseProfile.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { buildPromptSections, generateGptJson } from "../utils/gptService.js";

function createRequestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value, fieldName) {
  if (value === null || value === undefined || value === "") return null;
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw createRequestError(`Invalid ${fieldName}`);
  }
  return parsedDate;
}

function ensureEnumValue(value, allowedValues, fieldName, fallback = "") {
  const normalizedValue = normalizeString(value).toLowerCase();
  if (!normalizedValue) return fallback;
  if (!allowedValues.includes(normalizedValue)) {
    throw createRequestError(`Invalid ${fieldName}`);
  }
  return normalizedValue;
}

function buildCareMemberResponse(user) {
  if (!user?._id) return null;

  return {
    id: user._id.toString(),
    userNumber: user.userNumber ?? null,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    status: user.status
  };
}

function buildPatientOptionResponse(profile) {
  const user = profile?.user;
  if (!user?._id) return null;

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    status: user.status,
    userNumber: user.userNumber ?? null,
    priority: profile?.priority || "medium",
    followUpDueAt: profile?.followUpDueAt || null,
    nextAppointmentAt: profile?.nextAppointmentAt || null,
    lastInteractionAt: profile?.lastInteractionAt || user?.updatedAt || null
  };
}

function buildCrmTaskResponse(task) {
  if (!task?._id) return null;

  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description || "",
    category: task.category,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt || null,
    followUpAt: task.followUpAt || null,
    escalationRequired: Boolean(task.escalationRequired),
    callOutcome: task.callOutcome || "pending",
    lastCalledAt: task.lastCalledAt || null,
    completedAt: task.completedAt || null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    assignedDoctor: buildCareMemberResponse(task.assignedDoctor),
    patient: task?.patient?._id
      ? {
          id: task.patient._id.toString(),
          name: task.patient.name,
          email: task.patient.email,
          phone: task.patient.phone || "",
          status: task.patient.status,
          userNumber: task.patient.userNumber ?? null
        }
      : null,
    notes: Array.isArray(task.notes)
      ? task.notes.map((note) => ({
          content: note.content,
          createdAt: note.createdAt,
          createdBy: buildCareMemberResponse(note.createdBy)
        }))
      : []
  };
}

function matchesTaskSearch(task, search) {
  const normalizedSearch = normalizeString(search).toLowerCase();
  if (!normalizedSearch) return true;

  const searchValues = [
    task?.title,
    task?.description,
    task?.patient?.name,
    task?.patient?.email,
    task?.patient?.phone,
    task?.patient?.userNumber != null ? String(task.patient.userNumber) : ""
  ];

  return searchValues.some((value) => typeof value === "string" && value.toLowerCase().includes(normalizedSearch));
}

function buildTaskSummary(tasks) {
  const normalizedTasks = Array.isArray(tasks) ? tasks : [];
  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return normalizedTasks.reduce(
    (summary, task) => {
      summary.total += 1;

      if (task.status === "completed") summary.completed += 1;
      if (task.status === "pending" || task.status === "in_progress") summary.open += 1;
      if (task.escalationRequired) summary.escalations += 1;
      if (task.followUpAt && new Date(task.followUpAt).getTime() <= now && task.status !== "completed") summary.followUpDue += 1;

      if (task.dueAt) {
        const dueTime = new Date(task.dueAt).getTime();
        if (dueTime >= startOfToday.getTime() && dueTime <= endOfToday.getTime() && task.status !== "completed") {
          summary.dueToday += 1;
        }
      }

      if (task.completedAt) {
        const completedTime = new Date(task.completedAt).getTime();
        if (completedTime >= startOfToday.getTime() && completedTime <= endOfToday.getTime()) {
          summary.completedToday += 1;
        }
      }

      summary.byPriority[task.priority] += 1;
      summary.byStatus[task.status] += 1;

      return summary;
    },
    {
      total: 0,
      open: 0,
      completed: 0,
      dueToday: 0,
      followUpDue: 0,
      escalations: 0,
      completedToday: 0,
      byPriority: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      },
      byStatus: {
        pending: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0
      }
    }
  );
}

function coerceAiEnumValue(value, allowedValues, fallback) {
  const normalizedValue = normalizeString(value).toLowerCase();
  if (allowedValues.includes(normalizedValue)) {
    return normalizedValue;
  }
  return fallback;
}

function normalizeAiDate(value) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue || normalizedValue.toLowerCase() === "null") return null;

  const parsedDate = new Date(normalizedValue);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return parsedDate.toISOString();
}

async function generateAiNurseCrmTaskDraft({
  nurseUser,
  managedDoctor,
  patientProfile,
  prompt,
  tone,
  extraInstructions
}) {
  const promptText = normalizeString(prompt);
  if (!promptText) {
    throw createRequestError("prompt is required");
  }

  const patientUser = patientProfile?.user || null;
  const safeStatus = coerceAiEnumValue("pending", CRM_TASK_STATUS_ENUM, "pending");
  const systemPrompt = [
    "You create structured CRM task drafts for hospital nurses.",
    "Return valid JSON only with keys title, description, category, priority, status, dueAt, followUpAt, escalationRequired, and note.",
    "Use only the allowed enum values exactly as provided.",
    "Keep language concise, practical, and suitable for internal care coordination.",
    "Set dueAt and followUpAt to ISO 8601 date-time strings or null.",
    "For new tasks, prefer status pending unless the request clearly needs in_progress.",
    "Never return markdown, code fences, or explanatory text."
  ].join(" ");

  const userPrompt = buildPromptSections([
    { label: "Nurse name", value: nurseUser?.name || "Assigned nurse" },
    { label: "Managed doctor", value: managedDoctor?.name || "Not assigned" },
    { label: "Patient name", value: patientUser?.name || "Unknown patient" },
    { label: "Patient email", value: patientUser?.email || "Not available" },
    { label: "Patient phone", value: patientUser?.phone || "Not available" },
    { label: "Patient user number", value: patientUser?.userNumber ? String(patientUser.userNumber) : "Not assigned" },
    { label: "Patient CRM priority", value: patientProfile?.priority || "medium" },
    { label: "Patient next appointment", value: patientProfile?.nextAppointmentAt ? new Date(patientProfile.nextAppointmentAt).toISOString() : "Not scheduled" },
    { label: "Patient follow-up due", value: patientProfile?.followUpDueAt ? new Date(patientProfile.followUpDueAt).toISOString() : "Not set" },
    { label: "Patient last interaction", value: patientProfile?.lastInteractionAt ? new Date(patientProfile.lastInteractionAt).toISOString() : "Not available" },
    { label: "Allowed categories", value: CRM_TASK_CATEGORY_ENUM.join(", ") },
    { label: "Allowed priorities", value: CRM_TASK_PRIORITY_ENUM.join(", ") },
    { label: "Allowed statuses", value: CRM_TASK_STATUS_ENUM.join(", ") },
    { label: "Requested tone", value: normalizeString(tone) || "professional" },
    normalizeString(extraInstructions) ? { label: "Extra instructions", value: normalizeString(extraInstructions) } : null,
    { label: "Request", value: promptText }
  ]);

  const response = await generateGptJson({
    systemPrompt,
    userPrompt,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.4
  });

  const data = response?.data || {};
  const title = normalizeString(data.title) || `Follow up with ${patientUser?.name || "patient"}`;
  const description = normalizeString(data.description);
  const category = coerceAiEnumValue(data.category, CRM_TASK_CATEGORY_ENUM, "call");
  const priority = coerceAiEnumValue(data.priority, CRM_TASK_PRIORITY_ENUM, patientProfile?.priority || "medium");
  const requestedStatus = coerceAiEnumValue(data.status, CRM_TASK_STATUS_ENUM, safeStatus);
  const status = requestedStatus === "completed" || requestedStatus === "cancelled" ? "pending" : requestedStatus;
  const dueAt = normalizeAiDate(data.dueAt);
  const followUpAt = normalizeAiDate(data.followUpAt);
  const escalationRequired = Boolean(data.escalationRequired);
  const note = normalizeString(data.note);

  return {
    title,
    description,
    category,
    priority,
    status,
    dueAt,
    followUpAt,
    escalationRequired,
    note
  };
}

async function getNurseCrmScope(nurseId) {
  const nurseProfile = await NurseProfile.findOne({ user: nurseId })
    .populate("assignedDoctor", "name email phone status userNumber")
    .lean();

  const managedDoctor = nurseProfile?.assignedDoctor || null;
  const patientQuery = { assignedNurses: nurseId };

  if (managedDoctor?._id) {
    patientQuery.assignedDoctors = managedDoctor._id;
  }

  const patientProfiles = await PatientProfile.find(patientQuery)
    .populate("user", "name email phone status userNumber updatedAt")
    .sort({ updatedAt: -1 })
    .lean();

  const patientIds = patientProfiles
    .map((profile) => profile?.user?._id?.toString?.() || "")
    .filter(Boolean);

  return {
    nurseProfile,
    managedDoctor,
    patientProfiles,
    patientIds
  };
}

async function ensurePatientInScope({ nurseId, patientId, managedDoctorId }) {
  if (!/^[a-f\d]{24}$/i.test(patientId)) {
    throw createRequestError("Invalid patientId");
  }

  const query = {
    user: patientId,
    assignedNurses: nurseId
  };

  if (managedDoctorId) {
    query.assignedDoctors = managedDoctorId;
  }

  const patientProfile = await PatientProfile.findOne(query)
    .populate("user", "name email phone status userNumber")
    .lean();

  if (!patientProfile?.user?._id) {
    throw createRequestError("Selected patient is not assigned to this nurse", 403);
  }

  return patientProfile;
}

export async function listNurseCrmTasksController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const search = normalizeString(req?.query?.search);
    const status = ensureEnumValue(req?.query?.status, CRM_TASK_STATUS_ENUM, "status");
    const priority = ensureEnumValue(req?.query?.priority, CRM_TASK_PRIORITY_ENUM, "priority");
    const category = ensureEnumValue(req?.query?.category, CRM_TASK_CATEGORY_ENUM, "category");

    const { managedDoctor, patientProfiles, patientIds } = await getNurseCrmScope(nurseId);

    const taskQuery = { assignedNurse: nurseId };
    if (patientIds.length > 0) {
      taskQuery.patient = { $in: patientIds };
    }

    const rawTasks = await CrmTask.find(taskQuery)
      .populate("patient", "name email phone status userNumber")
      .populate("assignedDoctor", "name email phone status userNumber")
      .populate("notes.createdBy", "name email phone status userNumber")
      .sort({ escalationRequired: -1, priority: -1, dueAt: 1, updatedAt: -1 })
      .lean();

    const tasks = rawTasks
      .map((task) => buildCrmTaskResponse(task))
      .filter(Boolean)
      .filter((task) => (!status ? true : task.status === status))
      .filter((task) => (!priority ? true : task.priority === priority))
      .filter((task) => (!category ? true : task.category === category))
      .filter((task) => matchesTaskSearch(task, search));

    return res.json({
      tasks,
      summary: buildTaskSummary(tasks),
      patients: patientProfiles.map((profile) => buildPatientOptionResponse(profile)).filter(Boolean),
      options: {
        categories: CRM_TASK_CATEGORY_ENUM,
        priorities: CRM_TASK_PRIORITY_ENUM,
        statuses: CRM_TASK_STATUS_ENUM,
        callOutcomes: CRM_TASK_OUTCOME_ENUM
      },
      context: {
        nurseId,
        managedDoctor: buildCareMemberResponse(managedDoctor)
      }
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to fetch CRM tasks";
    return res.status(statusCode).json({ error: message });
  }
}

export async function createNurseCrmTaskController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = normalizeString(req?.body?.patientId);
    const title = normalizeString(req?.body?.title);
    const description = normalizeString(req?.body?.description);
    const category = ensureEnumValue(req?.body?.category, CRM_TASK_CATEGORY_ENUM, "category", "call") || "call";
    const priority = ensureEnumValue(req?.body?.priority, CRM_TASK_PRIORITY_ENUM, "priority", "medium") || "medium";
    const status = ensureEnumValue(req?.body?.status, CRM_TASK_STATUS_ENUM, "status", "pending") || "pending";
    const callOutcome = ensureEnumValue(req?.body?.callOutcome, CRM_TASK_OUTCOME_ENUM, "callOutcome", "pending") || "pending";
    const dueAt = normalizeDate(req?.body?.dueAt, "dueAt");
    const followUpAt = normalizeDate(req?.body?.followUpAt, "followUpAt");
    const escalationRequired = Boolean(req?.body?.escalationRequired);
    const initialNote = normalizeString(req?.body?.note);

    if (!patientId) {
      return res.status(400).json({ error: "patientId is required" });
    }

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    const { managedDoctor } = await getNurseCrmScope(nurseId);
    const patientProfile = await ensurePatientInScope({
      nurseId,
      patientId,
      managedDoctorId: managedDoctor?._id?.toString?.() || ""
    });

    const task = await CrmTask.create({
      patient: patientProfile.user._id,
      assignedNurse: nurseId,
      assignedDoctor: managedDoctor?._id || null,
      title,
      description,
      category,
      status,
      priority,
      dueAt,
      followUpAt,
      escalationRequired,
      callOutcome,
      lastCalledAt: callOutcome !== "pending" ? new Date() : null,
      completedAt: status === "completed" ? new Date() : null,
      notes: initialNote ? [{ content: initialNote, createdBy: nurseId, createdAt: new Date() }] : []
    });

    const populatedTask = await CrmTask.findById(task._id)
      .populate("patient", "name email phone status userNumber")
      .populate("assignedDoctor", "name email phone status userNumber")
      .populate("notes.createdBy", "name email phone status userNumber")
      .lean();

    return res.status(201).json({
      task: buildCrmTaskResponse(populatedTask)
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to create CRM task";
    return res.status(statusCode).json({ error: message });
  }
}

export async function generateNurseCrmTaskDraftController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = normalizeString(req?.body?.patientId);
    const prompt = normalizeString(req?.body?.prompt);
    const tone = normalizeString(req?.body?.tone);
    const extraInstructions = normalizeString(req?.body?.extraInstructions);

    if (!patientId) {
      return res.status(400).json({ error: "patientId is required" });
    }

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const { managedDoctor } = await getNurseCrmScope(nurseId);
    const patientProfile = await ensurePatientInScope({
      nurseId,
      patientId,
      managedDoctorId: managedDoctor?._id?.toString?.() || ""
    });

    const draft = await generateAiNurseCrmTaskDraft({
      nurseUser: req.user,
      managedDoctor,
      patientProfile,
      prompt,
      tone,
      extraInstructions
    });

    return res.json({
      message: "AI CRM task draft generated successfully.",
      draft,
      patient: buildPatientOptionResponse(patientProfile),
      context: {
        managedDoctor: buildCareMemberResponse(managedDoctor)
      }
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to generate CRM task draft";
    return res.status(statusCode).json({ error: message });
  }
}

export async function updateNurseCrmTaskController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const taskId = normalizeString(req?.params?.taskId);
    if (!/^[a-f\d]{24}$/i.test(taskId)) {
      return res.status(400).json({ error: "Invalid taskId" });
    }

    const task = await CrmTask.findOne({ _id: taskId, assignedNurse: nurseId });
    if (!task) {
      return res.status(404).json({ error: "CRM task not found" });
    }

    if (Object.prototype.hasOwnProperty.call(req?.body || {}, "title")) {
      const title = normalizeString(req?.body?.title);
      if (!title) return res.status(400).json({ error: "title cannot be empty" });
      task.title = title;
    }

    if (Object.prototype.hasOwnProperty.call(req?.body || {}, "description")) {
      task.description = normalizeString(req?.body?.description);
    }

    if (Object.prototype.hasOwnProperty.call(req?.body || {}, "category")) {
      task.category = ensureEnumValue(req?.body?.category, CRM_TASK_CATEGORY_ENUM, "category");
    }

    if (Object.prototype.hasOwnProperty.call(req?.body || {}, "priority")) {
      task.priority = ensureEnumValue(req?.body?.priority, CRM_TASK_PRIORITY_ENUM, "priority");
    }

    if (Object.prototype.hasOwnProperty.call(req?.body || {}, "status")) {
      task.status = ensureEnumValue(req?.body?.status, CRM_TASK_STATUS_ENUM, "status");
      task.completedAt = task.status === "completed" ? new Date() : null;
    }

    if (Object.prototype.hasOwnProperty.call(req?.body || {}, "callOutcome")) {
      task.callOutcome = ensureEnumValue(req?.body?.callOutcome, CRM_TASK_OUTCOME_ENUM, "callOutcome");
      task.lastCalledAt = task.callOutcome !== "pending" ? new Date() : task.lastCalledAt;
      if (task.callOutcome === "completed" && task.status !== "completed") {
        task.status = "completed";
        task.completedAt = new Date();
      }
      if (task.callOutcome === "escalated") {
        task.escalationRequired = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(req?.body || {}, "dueAt")) {
      task.dueAt = normalizeDate(req?.body?.dueAt, "dueAt");
    }

    if (Object.prototype.hasOwnProperty.call(req?.body || {}, "followUpAt")) {
      task.followUpAt = normalizeDate(req?.body?.followUpAt, "followUpAt");
    }

    if (Object.prototype.hasOwnProperty.call(req?.body || {}, "escalationRequired")) {
      task.escalationRequired = Boolean(req?.body?.escalationRequired);
    }

    const note = normalizeString(req?.body?.note);
    if (note) {
      task.notes.push({
        content: note,
        createdBy: nurseId,
        createdAt: new Date()
      });
    }

    await task.save();

    const populatedTask = await CrmTask.findById(task._id)
      .populate("patient", "name email phone status userNumber")
      .populate("assignedDoctor", "name email phone status userNumber")
      .populate("notes.createdBy", "name email phone status userNumber")
      .lean();

    return res.json({
      task: buildCrmTaskResponse(populatedTask)
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to update CRM task";
    return res.status(statusCode).json({ error: message });
  }
}
