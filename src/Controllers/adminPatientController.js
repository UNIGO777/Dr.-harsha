import mongoose from "mongoose";
import { User } from "../Models/User.js";
import { Appointment } from "../Models/Appointment.js";
import { CrmTask } from "../Models/CrmTask.js";
import {
  PATIENT_MEDICATION_DURATION_UNITS,
  PATIENT_MEDICATION_FOOD_TIMING_OPTIONS,
  PATIENT_MEDICATION_TIME_SLOTS,
  PatientProfile
} from "../Models/PatientProfile.js";
import { PatientReport } from "../Models/PatientReport.js";

const TERMINAL_APPOINTMENT_STATUSES = ["completed", "cancelled", "no_show"];

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function ensureObjectId(value, fieldName) {
  const normalizedValue = normalizeString(value);
  if (!/^[a-f\d]{24}$/i.test(normalizedValue)) {
    const error = new Error(`Invalid ${fieldName}`);
    error.statusCode = 400;
    throw error;
  }
  return normalizedValue;
}

function buildCareTeamMember(user) {
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

function buildNoteResponse(note) {
  if (!note?.content) return null;
  return {
    id: note?._id ? note._id.toString() : "",
    content: note.content,
    createdAt: note.createdAt || null,
    updatedAt: note.updatedAt || null,
    createdBy: buildCareTeamMember(note.createdBy)
  };
}

function buildMedicationResponse(medication) {
  if (!medication?._id || !medication?.medicineName) return null;
  return {
    id: medication._id.toString(),
    medicineName: medication.medicineName,
    patientId: medication?.patient?._id ? medication.patient._id.toString() : medication?.patient?.toString?.() || "",
    doctor: buildCareTeamMember(medication.doctor),
    addedBy: buildCareTeamMember(medication.addedBy),
    durationValue: typeof medication.durationValue === "number" ? medication.durationValue : null,
    durationUnit: medication.durationUnit || "",
    timeSlots: Array.isArray(medication.timeSlots) ? medication.timeSlots : [],
    foodTiming: medication.foodTiming || "",
    additionalInfo: medication.additionalInfo || "",
    createdAt: medication.createdAt || null,
    updatedAt: medication.updatedAt || null
  };
}

function buildAppointmentResponse(appointment, patientUser = null) {
  if (!appointment?._id) return null;
  return {
    id: appointment._id.toString(),
    scheduledAt: appointment.scheduledAt,
    endsAt: appointment.endsAt || null,
    slotMinutes: appointment.slotMinutes || null,
    reason: appointment.reason || "",
    appointmentType: appointment.appointmentType || "in_person",
    status: appointment.status || "scheduled",
    outcome: appointment.outcome || "",
    checkedInAt: appointment.checkedInAt || null,
    completedAt: appointment.completedAt || null,
    cancelledAt: appointment.cancelledAt || null,
    noShowAt: appointment.noShowAt || null,
    patient: buildCareTeamMember(appointment.patient) || buildCareTeamMember(patientUser),
    doctor: buildCareTeamMember(appointment.doctor),
    scheduledBy: buildCareTeamMember(appointment.scheduledBy),
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt
  };
}

function buildFollowUpResponse(task) {
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
    callOutcome: task.callOutcome || "pending",
    completedAt: task.completedAt || null,
    responseSummary: task.responseSummary || "",
    assignedDoctor: buildCareTeamMember(task.assignedDoctor),
    assignedNurse: buildCareTeamMember(task.assignedNurse),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function buildReportListItem(report) {
  if (!report?._id) return null;
  return {
    id: report._id.toString(),
    reportNumber: report.reportNumber ?? null,
    activeStepId: report.activeStepId || "",
    lastSavedStepId: report.lastSavedStepId || "",
    lastSavedAt: report.lastSavedAt || null,
    assignedNurse: buildCareTeamMember(report.assignedNurse),
    assignedDoctor: buildCareTeamMember(report.assignedDoctor),
    createdBy: buildCareTeamMember(report.createdBy),
    updatedBy: buildCareTeamMember(report.updatedBy),
    documentCount: Array.isArray(report.uploadedDocuments) ? report.uploadedDocuments.length : 0,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt
  };
}

function ensureNotesHaveIds(patientProfile) {
  if (!Array.isArray(patientProfile?.notes)) return false;
  let hasChanges = false;
  patientProfile.notes.forEach((note) => {
    if (!note) return;
    if (!note._id) {
      note._id = new mongoose.Types.ObjectId();
      hasChanges = true;
    }
  });
  return hasChanges;
}

// ── Get Full Patient Profile ────────────────────────────────────────────────

export async function getAdminPatientProfileController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const adminId = req?.user?._id?.toString?.() || "";
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = ensureObjectId(req?.params?.patientId, "patientId");

    const profileDoc = await PatientProfile.findOne({ user: patientId })
      .populate("user", "name email role phone gender status userNumber createdAt updatedAt lastLoginAt")
      .populate("assignedDoctors", "name email phone status userNumber")
      .populate("assignedNurses", "name email phone status userNumber")
      .populate("notes.createdBy", "name email phone status userNumber")
      .populate("medications.doctor", "name email phone status userNumber")
      .populate("medications.addedBy", "name email phone status userNumber");

    if (!profileDoc?._id || !profileDoc?.user?._id) {
      return res.status(404).json({ error: "Patient profile not found" });
    }

    if (ensureNotesHaveIds(profileDoc)) {
      await profileDoc.save();
    }

    const profile = profileDoc.toObject();
    const user = profile.user;
    const now = new Date();

    // Fetch related data in parallel
    const [futureFollowUps, followUpHistory, upcomingAppointments, pastAppointments, reports, medicineOptions] = await Promise.all([
      CrmTask.find({
        patient: user._id,
        status: { $in: ["pending", "in_progress"] },
        $or: [{ followUpAt: { $gte: now } }, { dueAt: { $gte: now } }]
      })
        .populate("assignedDoctor", "name email phone status userNumber")
        .populate("assignedNurse", "name email phone status userNumber")
        .sort({ followUpAt: 1, dueAt: 1 })
        .limit(20)
        .lean(),

      CrmTask.find({
        patient: user._id,
        $or: [{ followUpAt: { $lt: now } }, { completedAt: { $ne: null, $lt: now } }]
      })
        .populate("assignedDoctor", "name email phone status userNumber")
        .populate("assignedNurse", "name email phone status userNumber")
        .sort({ followUpAt: -1, completedAt: -1 })
        .limit(20)
        .lean(),

      Appointment.find({
        patient: user._id,
        scheduledAt: { $gte: now },
        status: { $nin: TERMINAL_APPOINTMENT_STATUSES }
      })
        .populate("doctor", "name email phone status userNumber")
        .populate("scheduledBy", "name email phone status userNumber")
        .sort({ scheduledAt: 1 })
        .limit(20)
        .lean(),

      Appointment.find({
        patient: user._id,
        $or: [{ scheduledAt: { $lt: now } }, { status: { $in: TERMINAL_APPOINTMENT_STATUSES } }]
      })
        .populate("doctor", "name email phone status userNumber")
        .populate("scheduledBy", "name email phone status userNumber")
        .sort({ scheduledAt: -1 })
        .limit(20)
        .lean(),

      PatientReport.find({ patient: user._id })
        .populate("assignedNurse", "name email phone status userNumber")
        .populate("assignedDoctor", "name email phone status userNumber")
        .populate("createdBy", "name email phone status userNumber")
        .populate("updatedBy", "name email phone status userNumber")
        .sort({ createdAt: -1 })
        .lean(),

      // Get all unique medicine names for autocomplete
      PatientProfile.aggregate([
        { $unwind: "$medications" },
        { $project: { medicineName: { $trim: { input: { $ifNull: ["$medications.medicineName", ""] } } } } },
        { $match: { medicineName: { $ne: "" } } },
        { $group: { _id: { $toLower: "$medicineName" }, medicineName: { $first: "$medicineName" } } },
        { $sort: { medicineName: 1 } }
      ])
    ]);

    const recentNotes = Array.isArray(profile.notes)
      ? [...profile.notes].sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0)).slice(0, 100)
      : [];

    const medications = Array.isArray(profile.medications)
      ? [...profile.medications].sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0))
      : [];

    return res.json({
      patient: {
        id: user._id.toString(),
        userNumber: user.userNumber ?? null,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        gender: user.gender || "",
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt || null,
        priority: profile.priority || "medium",
        age: typeof profile.age === "number" ? profile.age : null,
        reference: normalizeString(profile.reference),
        address: normalizeString(profile.address),
        secondaryPhone: normalizeString(profile.secondaryPhone),
        services: Array.isArray(profile.services) ? profile.services : [],
        tags: Array.isArray(profile.tags) ? profile.tags : [],
        assignedDoctors: (profile.assignedDoctors || []).map(buildCareTeamMember).filter(Boolean),
        assignedNurses: (profile.assignedNurses || []).map(buildCareTeamMember).filter(Boolean),
        lastInteractionAt: profile.lastInteractionAt || user.updatedAt || null,
        nextAppointmentAt: profile.nextAppointmentAt || null,
        followUpDueAt: profile.followUpDueAt || null,
        notes: recentNotes.map(buildNoteResponse).filter(Boolean),
        medications: medications.map(buildMedicationResponse).filter(Boolean),
        reports: reports.map(buildReportListItem).filter(Boolean),
        futureFollowUps: futureFollowUps.map(buildFollowUpResponse).filter(Boolean),
        followUpHistory: followUpHistory.map(buildFollowUpResponse).filter(Boolean),
        upcomingAppointments: upcomingAppointments.map((a) => buildAppointmentResponse(a, user)).filter(Boolean),
        pastAppointments: pastAppointments.map((a) => buildAppointmentResponse(a, user)).filter(Boolean),
        medicineOptions: medicineOptions.map((e) => normalizeString(e?.medicineName)).filter(Boolean)
      }
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to fetch patient profile";
    return res.status(statusCode).json({ error: message });
  }
}

// ── Add Medication ──────────────────────────────────────────────────────────

export async function addAdminPatientMedicationController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const adminId = req?.user?._id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = ensureObjectId(req?.params?.patientId, "patientId");
    const medicineName = normalizeString(req?.body?.medicineName);
    const durationUnit = normalizeString(req?.body?.durationUnit).toLowerCase();
    const foodTiming = normalizeString(req?.body?.foodTiming).toLowerCase();
    const additionalInfo = normalizeString(req?.body?.additionalInfo);
    const doctorId = normalizeString(req?.body?.doctorId);

    if (!medicineName) return res.status(400).json({ error: "medicineName is required" });
    if (!PATIENT_MEDICATION_DURATION_UNITS.includes(durationUnit)) return res.status(400).json({ error: "Invalid durationUnit" });
    if (!PATIENT_MEDICATION_FOOD_TIMING_OPTIONS.includes(foodTiming)) return res.status(400).json({ error: "Invalid foodTiming" });

    const durationValue = Number(req?.body?.durationValue);
    if (!Number.isInteger(durationValue) || durationValue < 1 || durationValue > 3650) {
      return res.status(400).json({ error: "durationValue must be a whole number between 1 and 3650" });
    }

    const timeSlots = Array.isArray(req?.body?.timeSlots) ? req.body.timeSlots : [];
    const normalizedTimeSlots = Array.from(new Set(timeSlots.map((s) => normalizeString(s).toLowerCase()).filter(Boolean)));
    if (normalizedTimeSlots.length === 0) return res.status(400).json({ error: "At least one time slot is required" });
    const invalidSlot = normalizedTimeSlots.find((s) => !PATIENT_MEDICATION_TIME_SLOTS.includes(s));
    if (invalidSlot) return res.status(400).json({ error: "Invalid time slot" });

    const profile = await PatientProfile.findOne({ user: patientId });
    if (!profile?._id) return res.status(404).json({ error: "Patient profile not found" });

    // Resolve doctor — use provided doctorId or first assigned doctor
    let resolvedDoctorId = doctorId || null;
    if (!resolvedDoctorId && Array.isArray(profile.assignedDoctors) && profile.assignedDoctors.length > 0) {
      resolvedDoctorId = profile.assignedDoctors[0].toString();
    }
    if (!resolvedDoctorId) return res.status(400).json({ error: "No doctor assigned to this patient. Please provide doctorId." });

    profile.medications.push({
      medicineName,
      patient: patientId,
      doctor: resolvedDoctorId,
      addedBy: adminId,
      durationValue,
      durationUnit,
      timeSlots: normalizedTimeSlots,
      foodTiming,
      additionalInfo
    });
    profile.lastInteractionAt = new Date();
    await profile.save();

    const updated = await PatientProfile.findById(profile._id)
      .populate("medications.doctor", "name email phone status userNumber")
      .populate("medications.addedBy", "name email phone status userNumber")
      .lean();
    const latest = Array.isArray(updated?.medications) ? updated.medications[updated.medications.length - 1] : null;

    return res.status(201).json({ message: "Medication added successfully.", medication: buildMedicationResponse(latest) });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to add medication";
    return res.status(statusCode).json({ error: message });
  }
}

// ── Update Medication ───────────────────────────────────────────────────────

export async function updateAdminPatientMedicationController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const adminId = req?.user?._id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = ensureObjectId(req?.params?.patientId, "patientId");
    const medicationId = normalizeString(req?.params?.medicationId);
    if (!medicationId) return res.status(400).json({ error: "medicationId is required" });

    const profile = await PatientProfile.findOne({ user: patientId });
    if (!profile?._id) return res.status(404).json({ error: "Patient profile not found" });

    const medication = Array.isArray(profile.medications) ? profile.medications.id(medicationId) : null;
    if (!medication) return res.status(404).json({ error: "Medication not found" });

    const body = req.body || {};

    if (body.medicineName !== undefined) {
      const name = normalizeString(body.medicineName);
      if (!name) return res.status(400).json({ error: "medicineName cannot be empty" });
      medication.medicineName = name;
    }
    if (body.durationValue !== undefined) {
      const val = Number(body.durationValue);
      if (!Number.isInteger(val) || val < 1 || val > 3650) return res.status(400).json({ error: "Invalid durationValue" });
      medication.durationValue = val;
    }
    if (body.durationUnit !== undefined) {
      const unit = normalizeString(body.durationUnit).toLowerCase();
      if (!PATIENT_MEDICATION_DURATION_UNITS.includes(unit)) return res.status(400).json({ error: "Invalid durationUnit" });
      medication.durationUnit = unit;
    }
    if (body.timeSlots !== undefined) {
      const slots = Array.isArray(body.timeSlots) ? body.timeSlots : [];
      const normalized = Array.from(new Set(slots.map((s) => normalizeString(s).toLowerCase()).filter(Boolean)));
      if (normalized.length === 0) return res.status(400).json({ error: "At least one time slot is required" });
      if (normalized.find((s) => !PATIENT_MEDICATION_TIME_SLOTS.includes(s))) return res.status(400).json({ error: "Invalid time slot" });
      medication.timeSlots = normalized;
    }
    if (body.foodTiming !== undefined) {
      const timing = normalizeString(body.foodTiming).toLowerCase();
      if (!PATIENT_MEDICATION_FOOD_TIMING_OPTIONS.includes(timing)) return res.status(400).json({ error: "Invalid foodTiming" });
      medication.foodTiming = timing;
    }
    if (body.additionalInfo !== undefined) {
      medication.additionalInfo = normalizeString(body.additionalInfo);
    }
    if (body.doctorId !== undefined) {
      medication.doctor = normalizeString(body.doctorId);
    }

    await profile.save();

    const updated = await PatientProfile.findById(profile._id)
      .populate("medications.doctor", "name email phone status userNumber")
      .populate("medications.addedBy", "name email phone status userNumber")
      .lean();
    const updatedMed = Array.isArray(updated?.medications) ? updated.medications.find((m) => m._id.toString() === medicationId) : null;

    return res.json({ message: "Medication updated successfully.", medication: buildMedicationResponse(updatedMed) });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to update medication";
    return res.status(statusCode).json({ error: message });
  }
}

// ── Delete Medication ───────────────────────────────────────────────────────

export async function deleteAdminPatientMedicationController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const adminId = req?.user?._id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = ensureObjectId(req?.params?.patientId, "patientId");
    const medicationId = normalizeString(req?.params?.medicationId);
    if (!medicationId) return res.status(400).json({ error: "medicationId is required" });

    const profile = await PatientProfile.findOne({ user: patientId });
    if (!profile?._id) return res.status(404).json({ error: "Patient profile not found" });

    const medication = Array.isArray(profile.medications) ? profile.medications.id(medicationId) : null;
    if (!medication) return res.status(404).json({ error: "Medication not found" });

    profile.medications.pull(medicationId);
    await profile.save();

    return res.json({ message: "Medication deleted successfully." });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to delete medication";
    return res.status(statusCode).json({ error: message });
  }
}

// ── Add Note ────────────────────────────────────────────────────────────────

export async function addAdminPatientNoteController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const adminId = req?.user?._id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = ensureObjectId(req?.params?.patientId, "patientId");
    const content = normalizeString(req?.body?.content);
    if (!content) return res.status(400).json({ error: "content is required" });

    const profile = await PatientProfile.findOne({ user: patientId });
    if (!profile?._id) return res.status(404).json({ error: "Patient profile not found" });

    if (ensureNotesHaveIds(profile)) await profile.save();

    profile.notes.push({ content, createdBy: adminId, createdAt: new Date(), updatedAt: null });
    profile.lastInteractionAt = new Date();
    await profile.save();

    const updated = await PatientProfile.findById(profile._id)
      .populate("notes.createdBy", "name email phone status userNumber")
      .lean();
    const latest = Array.isArray(updated?.notes) ? updated.notes[updated.notes.length - 1] : null;

    return res.status(201).json({ message: "Note added successfully.", note: buildNoteResponse(latest) });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to add note";
    return res.status(statusCode).json({ error: message });
  }
}

// ── Update Note ─────────────────────────────────────────────────────────────

export async function updateAdminPatientNoteController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const adminId = req?.user?._id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = ensureObjectId(req?.params?.patientId, "patientId");
    const noteId = normalizeString(req?.params?.noteId);
    const content = normalizeString(req?.body?.content);

    if (!noteId) return res.status(400).json({ error: "noteId is required" });
    if (!content) return res.status(400).json({ error: "content is required" });

    const profile = await PatientProfile.findOne({ user: patientId });
    if (!profile?._id) return res.status(404).json({ error: "Patient profile not found" });

    if (ensureNotesHaveIds(profile)) await profile.save();

    const note = Array.isArray(profile.notes) ? profile.notes.id(noteId) : null;
    if (!note) return res.status(404).json({ error: "Note not found" });

    note.content = content;
    note.updatedAt = new Date();
    await profile.save();

    const updated = await PatientProfile.findById(profile._id)
      .populate("notes.createdBy", "name email phone status userNumber")
      .lean();
    const updatedNote = Array.isArray(updated?.notes) ? updated.notes.find((n) => n._id.toString() === noteId) : null;

    return res.json({ message: "Note updated successfully.", note: buildNoteResponse(updatedNote) });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to update note";
    return res.status(statusCode).json({ error: message });
  }
}

// ── Delete Note ─────────────────────────────────────────────────────────────

export async function deleteAdminPatientNoteController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const adminId = req?.user?._id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = ensureObjectId(req?.params?.patientId, "patientId");
    const noteId = normalizeString(req?.params?.noteId);
    if (!noteId) return res.status(400).json({ error: "noteId is required" });

    const profile = await PatientProfile.findOne({ user: patientId });
    if (!profile?._id) return res.status(404).json({ error: "Patient profile not found" });

    if (ensureNotesHaveIds(profile)) await profile.save();

    const note = Array.isArray(profile.notes) ? profile.notes.id(noteId) : null;
    if (!note) return res.status(404).json({ error: "Note not found" });

    profile.notes.pull(noteId);
    await profile.save();

    return res.json({ message: "Note deleted successfully." });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to delete note";
    return res.status(statusCode).json({ error: message });
  }
}
