import mongoose from "mongoose";
import { User, USER_GENDERS_ENUM, USER_ROLES_ENUM, USER_STATUSES_ENUM } from "../Models/User.js";
import { Appointment } from "../Models/Appointment.js";
import { CrmTask } from "../Models/CrmTask.js";
import { DoctorProfile } from "../Models/DoctorProfile.js";
import { NurseProfile } from "../Models/NurseProfile.js";
import {
  PATIENT_MEDICATION_DURATION_UNITS,
  PATIENT_MEDICATION_FOOD_TIMING_OPTIONS,
  PATIENT_MEDICATION_TIME_SLOTS,
  PATIENT_SERVICE_OPTIONS,
  PATIENT_TAG_OPTIONS,
  PatientProfile
} from "../Models/PatientProfile.js";
import { createUserNotification } from "./notificationController.js";
import { sendUserActiveEmail, sendUserBlockedEmail, sendUserOnboardingEmail } from "../utils/emailService.js";
import { canCreateUser } from "../utils/permissions.js";
import {
  buildUserActiveWhatsappMessage,
  buildUserBlockedWhatsappMessage,
  buildUserOnboardingWhatsappMessage,
  sendWhatsappMessage
} from "../utils/Whatsapp.js";

const TERMINAL_APPOINTMENT_STATUSES = ["completed", "cancelled", "no_show"];

function buildUserResponse(user) {
  return {
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
    lastLoginAt: user.lastLoginAt || null
  };
}

function createRequestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUserGender(value, { allowEmpty = true } = {}) {
  if (value === undefined) return { hasValue: false, value: "" };

  const normalizedValue = normalizeString(value).toLowerCase();
  if (!normalizedValue) {
    if (allowEmpty) return { hasValue: true, value: "" };
    throw createRequestError("Gender is required");
  }

  if (!USER_GENDERS_ENUM.includes(normalizedValue)) {
    throw createRequestError("Gender must be male, female, or other");
  }

  return { hasValue: true, value: normalizedValue };
}

function parsePatientTextField(value) {
  if (value === undefined || value === null) return { hasValue: false, value: "" };
  return { hasValue: true, value: normalizeString(value) };
}

function normalizePatientSelection(values, allowedValues) {
  if (!Array.isArray(values)) return [];

  const allowedValueMap = new Map(allowedValues.map((value) => [value.toLowerCase(), value]));

  return Array.from(
    new Set(
      values
        .map((value) => normalizeString(value))
        .map((value) => allowedValueMap.get(value.toLowerCase()) || "")
        .filter(Boolean)
    )
  );
}

function parsePatientAge(value, { allowEmpty = true } = {}) {
  if (value === undefined) return { hasValue: false, value: null };
  if (value === null || value === "") {
    if (allowEmpty) return { hasValue: true, value: null };
    throw createRequestError("Age is required");
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue > 130) {
    throw createRequestError("Age must be a whole number between 0 and 130");
  }

  return { hasValue: true, value: numericValue };
}

function buildCareTeamMemberResponse(user) {
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

function buildSchedulingOption(user) {
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


async function buildUsersResponse(users) {
  const normalizedUsers = Array.isArray(users) ? users : [];
  const doctorUserIds = normalizedUsers.filter((user) => user?.role === "doctor").map((user) => user._id);
  const nurseUserIds = normalizedUsers.filter((user) => user?.role === "nurse").map((user) => user._id);
  const patientUserIds = normalizedUsers.filter((user) => user?.role === "patient").map((user) => user._id);

  if (doctorUserIds.length === 0 && nurseUserIds.length === 0 && patientUserIds.length === 0) {
    return normalizedUsers.map((user) => buildUserResponse(user));
  }

  const [doctorProfiles, nurseProfiles, patientProfiles] = await Promise.all([
    doctorUserIds.length > 0 ? DoctorProfile.find({ user: { $in: doctorUserIds } }).lean() : [],
    nurseUserIds.length > 0
      ? NurseProfile.find({ user: { $in: nurseUserIds } })
          .populate("assignedDoctor", "name email phone status userNumber")
          .lean()
      : [],
    patientUserIds.length > 0
      ? PatientProfile.find({ user: { $in: patientUserIds } })
          .populate("assignedDoctors", "name email phone status userNumber")
          .populate("assignedNurses", "name email phone status userNumber")
          .lean()
      : []
  ]);

  const doctorSettingsByUserId = new Map(
    doctorProfiles.map((profile) => [
      profile.user.toString(),
      {
        allowCustomSchedule: Boolean(profile.allowCustomSchedule),
        weeklyAvailability: profile.weeklyAvailability || {}
      }
    ])
  );
  const assignmentByUserId = new Map(
    nurseProfiles.map((profile) => [profile.user.toString(), buildCareTeamMemberResponse(profile.assignedDoctor)])
  );
  const patientAssignmentsByUserId = new Map(
    patientProfiles.map((profile) => [
      profile.user.toString(),
      {
        assignedDoctors: Array.isArray(profile.assignedDoctors)
          ? profile.assignedDoctors.map((doctor) => buildCareTeamMemberResponse(doctor)).filter(Boolean)
          : [],
        assignedNurses: Array.isArray(profile.assignedNurses)
          ? profile.assignedNurses.map((nurse) => buildCareTeamMemberResponse(nurse)).filter(Boolean)
          : [],
        age: typeof profile?.age === "number" ? profile.age : null,
        reference: normalizeString(profile?.reference),
        address: normalizeString(profile?.address),
        secondaryPhone: normalizeString(profile?.secondaryPhone),
        services: Array.isArray(profile?.services) ? profile.services : [],
        tags: Array.isArray(profile?.tags) ? profile.tags : []
      }
    ])
  );

  return normalizedUsers.map((user) => ({
    ...buildUserResponse(user),
    allowCustomSchedule: user.role === "doctor" ? Boolean(doctorSettingsByUserId.get(user._id.toString())?.allowCustomSchedule) : false,
    weeklyAvailability: user.role === "doctor" ? doctorSettingsByUserId.get(user._id.toString())?.weeklyAvailability || {} : {},
    assignedDoctor: user.role === "nurse" ? assignmentByUserId.get(user._id.toString()) || null : null,
    assignedDoctors: user.role === "patient" ? patientAssignmentsByUserId.get(user._id.toString())?.assignedDoctors || [] : [],
    assignedNurses: user.role === "patient" ? patientAssignmentsByUserId.get(user._id.toString())?.assignedNurses || [] : [],
    age: user.role === "patient" ? patientAssignmentsByUserId.get(user._id.toString())?.age ?? null : null,
    reference: user.role === "patient" ? patientAssignmentsByUserId.get(user._id.toString())?.reference || "" : "",
    address: user.role === "patient" ? patientAssignmentsByUserId.get(user._id.toString())?.address || "" : "",
    secondaryPhone: user.role === "patient" ? patientAssignmentsByUserId.get(user._id.toString())?.secondaryPhone || "" : "",
    services: user.role === "patient" ? patientAssignmentsByUserId.get(user._id.toString())?.services || [] : [],
    tags: user.role === "patient" ? patientAssignmentsByUserId.get(user._id.toString())?.tags || [] : []
  }));
}

function buildPatientManagementResponse({ profile, managedDoctor }) {
  const user = profile?.user;
  if (!user?._id) return null;

  const assignedDoctors = Array.isArray(profile.assignedDoctors)
    ? profile.assignedDoctors.map((doctor) => buildCareTeamMemberResponse(doctor)).filter(Boolean)
    : [];
  const assignedNurses = Array.isArray(profile.assignedNurses)
    ? profile.assignedNurses.map((nurse) => buildCareTeamMemberResponse(nurse)).filter(Boolean)
    : [];
  const nextAppointmentAt = profile?.nextAppointmentAt || null;
  const followUpDueAt = profile?.followUpDueAt || null;
  let priority = profile?.priority || "medium";

  if (followUpDueAt && new Date(followUpDueAt).getTime() < Date.now() && (priority === "low" || priority === "medium")) {
    priority = "high";
  }

  return {
    ...buildUserResponse(user),
    priority,
    assignedDoctors,
    assignedNurses,
    age: typeof profile?.age === "number" ? profile.age : null,
    reference: normalizeString(profile?.reference),
    address: normalizeString(profile?.address),
    secondaryPhone: normalizeString(profile?.secondaryPhone),
    services: Array.isArray(profile?.services) ? profile.services : [],
    tags: Array.isArray(profile?.tags) ? profile.tags : [],
    managedDoctor: buildCareTeamMemberResponse(managedDoctor),
    lastInteractionAt: profile?.lastInteractionAt || user?.updatedAt || profile?.updatedAt || user?.createdAt || null,
    nextAppointmentAt,
    followUpDueAt
  };
}

function buildPatientProfileNoteResponse(note) {
  if (!note?.content) return null;

  return {
    id: note?._id ? note._id.toString() : "",
    content: note.content,
    createdAt: note.createdAt || null,
    updatedAt: note.updatedAt || null,
    createdBy: buildCareTeamMemberResponse(note.createdBy)
  };
}

function buildPatientMedicationResponse(medication) {
  if (!medication?._id || !medication?.medicineName) return null;

  return {
    id: medication._id.toString(),
    medicineName: medication.medicineName,
    patientId: medication?.patient?._id ? medication.patient._id.toString() : medication?.patient?.toString?.() || "",
    doctor: buildCareTeamMemberResponse(medication.doctor),
    addedBy: buildCareTeamMemberResponse(medication.addedBy),
    durationValue: typeof medication.durationValue === "number" ? medication.durationValue : null,
    durationUnit: medication.durationUnit || "",
    timeSlots: Array.isArray(medication.timeSlots) ? medication.timeSlots : [],
    foodTiming: medication.foodTiming || "",
    additionalInfo: medication.additionalInfo || "",
    createdAt: medication.createdAt || null,
    updatedAt: medication.updatedAt || null
  };
}

function parseMedicationDurationValue(value) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 3650) {
    throw createRequestError("durationValue must be a whole number between 1 and 3650");
  }

  return numericValue;
}

function parseMedicationTimeSlots(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createRequestError("At least one medication time slot is required");
  }

  const normalizedTimeSlots = Array.from(
    new Set(
      value
        .map((entry) => normalizeString(entry).toLowerCase())
        .filter(Boolean)
    )
  );

  if (normalizedTimeSlots.length === 0) {
    throw createRequestError("At least one medication time slot is required");
  }

  const invalidTimeSlot = normalizedTimeSlots.find((entry) => !PATIENT_MEDICATION_TIME_SLOTS.includes(entry));
  if (invalidTimeSlot) {
    throw createRequestError("Invalid medication time slot");
  }

  return normalizedTimeSlots;
}

function ensurePatientProfileNotesHaveIds(patientProfile) {
  if (!Array.isArray(patientProfile?.notes)) return false;

  let hasChanges = false;

  patientProfile.notes.forEach((note) => {
    if (!note) return;

    if (!note._id) {
      note._id = new mongoose.Types.ObjectId();
      hasChanges = true;
    }

    if (typeof note.updatedAt === "undefined") {
      note.updatedAt = null;
      hasChanges = true;
    }
  });

  return hasChanges;
}

function buildAppointmentNoteResponse(note) {
  if (!note?._id || !note?.message) return null;

  return {
    id: note._id.toString(),
    message: note.message,
    kind: note.kind || "internal",
    createdAt: note.createdAt || null,
    createdBy: buildCareTeamMemberResponse(note.createdBy)
  };
}

function buildPatientFollowUpHistoryResponse(task) {
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
    lastCalledAt: task.lastCalledAt || null,
    completedAt: task.completedAt || null,
    responseSummary: task.responseSummary || "",
    patientResponse: task.patientResponse || "",
    nextStep: task.nextStep || "",
    respondedAt: task.respondedAt || null,
    assignedDoctor: buildCareTeamMemberResponse(task.assignedDoctor),
    assignedNurse: buildCareTeamMemberResponse(task.assignedNurse),
    linkedNextTask: task?.linkedNextTask?._id
      ? {
          id: task.linkedNextTask._id.toString(),
          title: task.linkedNextTask.title,
          status: task.linkedNextTask.status,
          priority: task.linkedNextTask.priority,
          followUpAt: task.linkedNextTask.followUpAt || null,
          dueAt: task.linkedNextTask.dueAt || null
        }
      : null,
    linkedAppointment: task?.linkedAppointment?._id
      ? {
          id: task.linkedAppointment._id.toString(),
          scheduledAt: task.linkedAppointment.scheduledAt || null,
          endsAt: task.linkedAppointment.endsAt || null,
          status: task.linkedAppointment.status || "scheduled",
          outcome: task.linkedAppointment.outcome || "",
          reason: task.linkedAppointment.reason || ""
        }
      : null,
    notes: Array.isArray(task.notes)
      ? task.notes.map((note) => buildPatientProfileNoteResponse(note)).filter(Boolean)
      : [],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function buildPatientAppointmentHistoryResponse(appointment, patientUser = null) {
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
    preparationInstructions: appointment.preparationInstructions || "",
    documentsRequired: Boolean(appointment.documentsRequired),
    reportsRequired: Boolean(appointment.reportsRequired),
    preVisitUpdateRequired: Boolean(appointment.preVisitUpdateRequired),
    confirmationSentAt: appointment.confirmationSentAt || null,
    lastReminderAt: appointment.lastReminderAt || null,
    lastReminderType: appointment.lastReminderType || "",
    checkedInAt: appointment.checkedInAt || null,
    completedAt: appointment.completedAt || null,
    cancelledAt: appointment.cancelledAt || null,
    noShowAt: appointment.noShowAt || null,
    patient: buildSchedulingOption(appointment.patient) || buildSchedulingOption(patientUser),
    doctor: buildCareTeamMemberResponse(appointment.doctor),
    scheduledBy: buildCareTeamMemberResponse(appointment.scheduledBy),
    notes: Array.isArray(appointment.notes) ? appointment.notes.map((note) => buildAppointmentNoteResponse(note)).filter(Boolean) : [],
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt
  };
}

function ensureObjectId(value, fieldName) {
  const normalizedValue = normalizeString(value);
  if (!/^[a-f\d]{24}$/i.test(normalizedValue)) {
    throw createRequestError(`Invalid ${fieldName}`, 400);
  }

  return normalizedValue;
}

async function getManagedDoctorForNurse(nurseId) {
  if (!nurseId) {
    throw createRequestError("Unauthorized", 401);
  }

  const nurseProfile = await NurseProfile.findOne({ user: nurseId })
    .populate("assignedDoctor", "name email phone status userNumber")
    .lean();

  if (!nurseProfile?.assignedDoctor?._id) {
    throw createRequestError("No managed doctor linked to this nurse", 404);
  }

  return nurseProfile.assignedDoctor;
}

function buildScopedPatientProfileQuery({ nurseId, managedDoctorId, patientId }) {
  return {
    user: ensureObjectId(patientId, "patientId"),
    assignedDoctors: managedDoctorId,
    assignedNurses: nurseId
  };
}

async function resolvePatientMedicationAccess({ actor }) {
  const actorId = actor?.user?._id;
  const actorRole = normalizeString(actor?.user?.role).toLowerCase();
  const patientId = ensureObjectId(actor?.params?.patientId, "patientId");

  if (!actorId) {
    throw createRequestError("Unauthorized", 401);
  }

  if (actorRole === "nurse") {
    const managedDoctor = await getManagedDoctorForNurse(actorId);
    const patientProfile = await PatientProfile.findOne(
      buildScopedPatientProfileQuery({
        nurseId: actorId,
        managedDoctorId: managedDoctor._id,
        patientId
      })
    );

    if (!patientProfile?._id) {
      throw createRequestError("Patient not found in your assignment", 404);
    }

    return {
      patientProfile,
      doctorId: managedDoctor._id,
      patientId
    };
  }

  if (actorRole === "doctor") {
    const patientProfile = await PatientProfile.findOne({
      user: patientId,
      assignedDoctors: actorId
    });

    if (!patientProfile?._id) {
      throw createRequestError("Patient not found in your assignment", 404);
    }

    return {
      patientProfile,
      doctorId: actorId,
      patientId
    };
  }

  throw createRequestError("Unauthorized", 403);
}

async function listMedicationNameOptions() {
  const medicationNameGroups = await PatientProfile.aggregate([
    { $unwind: "$medications" },
    {
      $project: {
        medicineName: {
          $trim: {
            input: { $ifNull: ["$medications.medicineName", ""] }
          }
        }
      }
    },
    { $match: { medicineName: { $ne: "" } } },
    {
      $group: {
        _id: { $toLower: "$medicineName" },
        medicineName: { $first: "$medicineName" }
      }
    },
    { $sort: { medicineName: 1 } }
  ]);

  return medicationNameGroups
    .map((entry) => normalizeString(entry?.medicineName))
    .filter(Boolean);
}

function buildPatientManagementSummary(patients) {
  const normalizedPatients = Array.isArray(patients) ? patients : [];
  const now = Date.now();

  return normalizedPatients.reduce(
    (summary, patient) => {
      summary.total += 1;

      if (patient?.status === "active") summary.active += 1;
      if (patient?.status === "blocked") summary.blocked += 1;
      if (patient?.followUpDueAt && new Date(patient.followUpDueAt).getTime() <= now) summary.followUpDue += 1;
      if (patient?.nextAppointmentAt) summary.upcomingAppointments += 1;

      const priorityKey = ["low", "medium", "high", "critical"].includes(patient?.priority) ? patient.priority : "medium";
      summary.priority[priorityKey] += 1;

      return summary;
    },
    {
      total: 0,
      active: 0,
      blocked: 0,
      followUpDue: 0,
      upcomingAppointments: 0,
      priority: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      }
    }
  );
}

function matchesPatientManagementSearch(patient, search) {
  const normalizedSearch = typeof search === "string" ? search.trim().toLowerCase() : "";
  if (!normalizedSearch) return true;

  const haystacks = [
    patient?.name,
    patient?.email,
    patient?.phone,
    patient?.secondaryPhone,
    patient?.userNumber != null ? String(patient.userNumber) : "",
    patient?.age != null ? String(patient.age) : "",
    patient?.reference,
    patient?.address,
    ...(Array.isArray(patient?.services) ? patient.services : []),
    ...(Array.isArray(patient?.tags) ? patient.tags : []),
    ...(Array.isArray(patient?.assignedDoctors) ? patient.assignedDoctors.map((doctor) => doctor?.name || "") : []),
    ...(Array.isArray(patient?.assignedNurses) ? patient.assignedNurses.map((nurse) => nurse?.name || "") : [])
  ];

  return haystacks.some((value) => typeof value === "string" && value.toLowerCase().includes(normalizedSearch));
}

async function findDoctorUserById(doctorId) {
  const normalizedDoctorId = typeof doctorId === "string" ? doctorId.trim() : "";

  if (!normalizedDoctorId) {
    throw createRequestError("assignedDoctorId is required for nurse users");
  }

  if (!/^[a-f\d]{24}$/i.test(normalizedDoctorId)) {
    throw createRequestError("Invalid assignedDoctorId");
  }

  const doctor = await User.findOne({ _id: normalizedDoctorId, role: "doctor" }).lean();
  if (!doctor) {
    throw createRequestError("Selected assigned doctor was not found");
  }

  return doctor;
}

async function resolveAssignedDoctorForNurse({ creator, creatorRole, assignedDoctorId }) {
  if (creatorRole === "doctor") {
    const creatorId = creator?._id?.toString?.() || "";
    const normalizedAssignedDoctorId = typeof assignedDoctorId === "string" ? assignedDoctorId.trim() : "";

    if (normalizedAssignedDoctorId && normalizedAssignedDoctorId !== creatorId) {
      throw createRequestError("Doctor can only assign nurses to their own account", 403);
    }

    const doctor = await User.findOne({ _id: creator?._id, role: "doctor" }).lean();
    if (!doctor) {
      throw createRequestError("Doctor account not found for nurse assignment", 404);
    }

    return doctor;
  }

  return findDoctorUserById(assignedDoctorId);
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

async function findUsersByIdsAndRole(userIds, role, fieldName) {
  const normalizedIds = normalizeIdArray(userIds);

  for (const userId of normalizedIds) {
    if (!/^[a-f\d]{24}$/i.test(userId)) {
      throw createRequestError(`Invalid ${fieldName}`);
    }
  }

  if (normalizedIds.length === 0) {
    return [];
  }

  const users = await User.find({ _id: { $in: normalizedIds }, role }).lean();
  if (users.length !== normalizedIds.length) {
    throw createRequestError(`One or more selected ${role}s were not found`);
  }

  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  return normalizedIds.map((userId) => usersById.get(userId)).filter(Boolean);
}

async function resolvePatientCareTeam({ creator, creatorRole, assignedDoctorIds, assignedNurseIds }) {
  const doctorIds = normalizeIdArray(assignedDoctorIds);
  const nurseIds = normalizeIdArray(assignedNurseIds);
  const creatorId = creator?._id?.toString?.() || "";

  if (creatorRole === "doctor" && creatorId) {
    doctorIds.push(creatorId);
  }

  if (creatorRole === "nurse" && creatorId) {
    nurseIds.push(creatorId);
  }

  const doctors = await findUsersByIdsAndRole(doctorIds, "doctor", "assignedDoctorIds");
  const nurses = await findUsersByIdsAndRole(nurseIds, "nurse", "assignedNurseIds");

  if (doctors.length === 0) {
    throw createRequestError("At least one assigned doctor is required for patient users");
  }

  if (nurses.length === 0) {
    throw createRequestError("At least one assigned nurse is required for patient users");
  }

  return {
    doctors,
    nurses,
    assignedDoctorIds: doctors.map((doctor) => doctor._id),
    assignedNurseIds: nurses.map((nurse) => nurse._id)
  };
}

function normalizeNotificationResult(result, defaultStatus = "sent") {
  if (result.status === "fulfilled") {
    return result.value?.status ? result.value : { status: defaultStatus };
  }

  return {
    status: "failed",
    reason: result.reason instanceof Error ? result.reason.message : "Notification failed"
  };
}

function buildNotificationSummary(emailResult, whatsappResult) {
  const notifications = {
    email: normalizeNotificationResult(emailResult),
    whatsapp: normalizeNotificationResult(whatsappResult)
  };

  const notificationWarnings = Object.entries(notifications)
    .filter(([, value]) => value.status !== "sent")
    .map(([channel, value]) => `${channel}: ${value.reason || value.status}`);

  return { notifications, notificationWarnings };
}

async function sendOnboardingNotifications(user) {
  const [emailResult, whatsappResult] = await Promise.allSettled([
    sendUserOnboardingEmail({
      toEmail: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      userNumber: user.userNumber
    }),
    sendWhatsappMessage({
      toPhone: user.phone,
      message: buildUserOnboardingWhatsappMessage({
        name: user.name,
        role: user.role,
        email: user.email,
        userNumber: user.userNumber
      }),
      templateType: "user_onboarding",
      meta: {
        userId: user._id.toString(),
        role: user.role,
        userNumber: user.userNumber
      }
    })
  ]);

  return buildNotificationSummary(emailResult, whatsappResult);
}

async function sendBlockedNotifications(user) {
  const [emailResult, whatsappResult] = await Promise.allSettled([
    sendUserBlockedEmail({
      toEmail: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      userNumber: user.userNumber
    }),
    sendWhatsappMessage({
      toPhone: user.phone,
      message: buildUserBlockedWhatsappMessage({
        name: user.name,
        role: user.role,
        userNumber: user.userNumber
      }),
      templateType: "user_blocked",
      meta: {
        userId: user._id.toString(),
        role: user.role,
        userNumber: user.userNumber
      }
    })
  ]);

  return buildNotificationSummary(emailResult, whatsappResult);
}

async function sendActiveNotifications(user) {
  const [emailResult, whatsappResult] = await Promise.allSettled([
    sendUserActiveEmail({
      toEmail: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      userNumber: user.userNumber
    }),
    sendWhatsappMessage({
      toPhone: user.phone,
      message: buildUserActiveWhatsappMessage({
        name: user.name,
        role: user.role,
        userNumber: user.userNumber
      }),
      templateType: "user_active",
      meta: {
        userId: user._id.toString(),
        role: user.role,
        userNumber: user.userNumber
      }
    })
  ]);

  return buildNotificationSummary(emailResult, whatsappResult);
}

export async function createUserController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const creator = req.user;
    const creatorRole = typeof creator?.role === "string" ? creator.role : "";

    const name = typeof req?.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req?.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req?.body?.password === "string" ? req.body.password : "";
    const role = typeof req?.body?.role === "string" ? req.body.role.trim() : "";
    const phone = typeof req?.body?.phone === "string" ? req.body.phone.trim() : "";
    const gender = normalizeUserGender(req?.body?.gender);
    const status = typeof req?.body?.status === "string" ? req.body.status.trim() : "active";
    const assignedDoctorId = typeof req?.body?.assignedDoctorId === "string" ? req.body.assignedDoctorId.trim() : "";
    const assignedDoctorIds = req?.body?.assignedDoctorIds;
    const assignedNurseIds = req?.body?.assignedNurseIds;
    const patientAge = parsePatientAge(req?.body?.age);
    const patientReference = parsePatientTextField(req?.body?.reference);
    const patientAddress = parsePatientTextField(req?.body?.address);
    const patientSecondaryPhone = parsePatientTextField(req?.body?.secondaryPhone);
    const patientServices = normalizePatientSelection(req?.body?.services, PATIENT_SERVICE_OPTIONS);
    const patientTags = normalizePatientSelection(req?.body?.tags, PATIENT_TAG_OPTIONS);

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password, role are required" });
    }
    if (!USER_ROLES_ENUM.includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (!USER_STATUSES_ENUM.includes(status)) return res.status(400).json({ error: "Invalid status" });

    if (!canCreateUser(creatorRole, role)) {
      return res.status(403).json({ error: "Permission denied" });
    }

    const exists = await User.findOne({ email }).lean();
    if (exists) return res.status(409).json({ error: "Email already exists" });

    const assignedDoctor = role === "nurse" ? await resolveAssignedDoctorForNurse({ creator, creatorRole, assignedDoctorId }) : null;
    const patientCareTeam =
      role === "patient" ? await resolvePatientCareTeam({ creator, creatorRole, assignedDoctorIds, assignedNurseIds }) : null;

    const user = await User.create({ name, email, password, role, phone, gender: gender.value, status });

    const createdBy = creator?._id || null;
    if (role === "doctor") await DoctorProfile.create({ user: user._id, createdBy });
    if (role === "nurse") await NurseProfile.create({ user: user._id, createdBy, assignedDoctor: assignedDoctor?._id || null });
    if (role === "patient") {
      await PatientProfile.create({
        user: user._id,
        createdBy,
        assignedDoctors: patientCareTeam?.assignedDoctorIds || [],
        assignedNurses: patientCareTeam?.assignedNurseIds || [],
        age: patientAge.value,
        reference: patientReference.value,
        address: patientAddress.value,
        secondaryPhone: patientSecondaryPhone.value,
        services: patientServices,
        tags: patientTags
      });
    }
    const { notifications, notificationWarnings } = await sendOnboardingNotifications(user);
    await createUserNotification({
      userId: user._id,
      createdBy,
      type: "account_created",
      title: "Account created",
      message: `Your ${user.role.replace(/_/g, " ")} account has been created successfully.`,
      metadata: {
        role: user.role,
        userNumber: user.userNumber
      }
    });

    return res.status(201).json({
      message: notificationWarnings.length === 0 ? "User created and onboarding notifications sent." : "User created. Some onboarding notifications could not be delivered.",
      notifications,
      notificationWarnings,
      user: {
        ...buildUserResponse(user),
        assignedDoctor: assignedDoctor ? buildCareTeamMemberResponse(assignedDoctor) : null,
        assignedDoctors: patientCareTeam?.doctors?.map((doctor) => buildCareTeamMemberResponse(doctor)).filter(Boolean) || [],
        assignedNurses: patientCareTeam?.nurses?.map((nurse) => buildCareTeamMemberResponse(nurse)).filter(Boolean) || [],
        age: role === "patient" ? patientAge.value : null,
        reference: role === "patient" ? patientReference.value : "",
        address: role === "patient" ? patientAddress.value : "",
        secondaryPhone: role === "patient" ? patientSecondaryPhone.value : "",
        services: role === "patient" ? patientServices : [],
        tags: role === "patient" ? patientTags : []
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create user";
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(statusCode).json({ error: message });
  }
}

export async function listUsersController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const requestedRole = typeof req?.query?.role === "string" ? req.query.role.trim() : "";
    const search = typeof req?.query?.search === "string" ? req.query.search.trim() : "";
    const requesterRole = typeof req?.user?.role === "string" ? req.user.role : "";
    const allowedRolesByRequester = {
      super_admin: USER_ROLES_ENUM,
      doctor: ["doctor", "nurse"],
      nurse: ["doctor", "nurse"],
      patient: []
    };
    const allowedRoles = allowedRolesByRequester[requesterRole] || [];

    if (requestedRole && !USER_ROLES_ENUM.includes(requestedRole)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    if (requestedRole && !allowedRoles.includes(requestedRole)) {
      return res.status(403).json({ error: "Permission denied" });
    }
    if (!requestedRole && requesterRole !== "super_admin") {
      return res.status(403).json({ error: "Role is required" });
    }

    const query = {};
    if (requestedRole) {
      query.role = requestedRole;
    } else if (requesterRole !== "super_admin") {
      query.role = { $in: allowedRoles };
    }
    if (search) {
      const searchClauses = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];

      if (/^\d+$/.test(search)) {
        searchClauses.push({ userNumber: Number(search) });
      }

      query.$or = searchClauses;
    }

    const users = await User.find(query).sort({ createdAt: -1 }).lean();

    return res.json({
      users: await buildUsersResponse(users)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch users";
    return res.status(500).json({ error: message });
  }
}

export async function listNursePatientManagementController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id;
    const search = typeof req?.query?.search === "string" ? req.query.search.trim() : "";
    const status = typeof req?.query?.status === "string" ? req.query.status.trim() : "";
    const priority = typeof req?.query?.priority === "string" ? req.query.priority.trim().toLowerCase() : "";

    if (!nurseId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (status && !USER_STATUSES_ENUM.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    if (priority && !["low", "medium", "high", "critical"].includes(priority)) {
      return res.status(400).json({ error: "Invalid priority" });
    }

    const nurseProfile = await NurseProfile.findOne({ user: nurseId })
      .populate("assignedDoctor", "name email phone status userNumber")
      .lean();

    const managedDoctor = nurseProfile?.assignedDoctor || null;

    if (!managedDoctor?._id) {
      return res.json({
        patients: [],
        summary: buildPatientManagementSummary([]),
        options: {
          patients: [],
          doctors: []
        },
        context: {
          nurseId: nurseId.toString(),
          managedDoctor: null
        }
      });
    }

    const patientProfiles = await PatientProfile.find({
      assignedDoctors: managedDoctor._id,
      assignedNurses: nurseId
    })
      .populate("user", "name email role phone status userNumber createdAt updatedAt lastLoginAt")
      .populate("assignedDoctors", "name email phone status userNumber")
      .populate("assignedNurses", "name email phone status userNumber")
      .sort({ updatedAt: -1 })
      .lean();

    const patients = patientProfiles
      .map((profile) => buildPatientManagementResponse({ profile, managedDoctor }))
      .filter(Boolean)
      .filter((patient) => matchesPatientManagementSearch(patient, search))
      .filter((patient) => (!status ? true : patient.status === status))
      .filter((patient) => (!priority ? true : patient.priority === priority));

    const [schedulablePatients, schedulableDoctors] = await Promise.all([
      User.find({ role: "patient", status: "active" }).sort({ name: 1 }).lean(),
      User.find({ role: "doctor", status: "active" }).sort({ name: 1 }).lean()
    ]);

    return res.json({
      patients,
      summary: buildPatientManagementSummary(patients),
      options: {
        patients: schedulablePatients.map((user) => buildSchedulingOption(user)).filter(Boolean),
        doctors: schedulableDoctors.map((user) => buildSchedulingOption(user)).filter(Boolean)
      },
      context: {
        nurseId: nurseId.toString(),
        managedDoctor: buildCareTeamMemberResponse(managedDoctor)
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch nurse patients";
    return res.status(500).json({ error: message });
  }
}

export async function getNursePatientProfileController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id;
    const patientId = req?.params?.patientId;
    const managedDoctor = await getManagedDoctorForNurse(nurseId);
    const patientProfileQuery = buildScopedPatientProfileQuery({
      nurseId,
      managedDoctorId: managedDoctor._id,
      patientId
    });

    const patientProfileDocument = await PatientProfile.findOne(patientProfileQuery);

    if (!patientProfileDocument?._id) {
      return res.status(404).json({ error: "Patient not found in your assignment" });
    }

    if (ensurePatientProfileNotesHaveIds(patientProfileDocument)) {
      await patientProfileDocument.save();
    }

    const patientProfile = await PatientProfile.findById(patientProfileDocument._id)
      .populate("user", "name email role phone status userNumber createdAt updatedAt lastLoginAt")
      .populate("assignedDoctors", "name email phone status userNumber")
      .populate("assignedNurses", "name email phone status userNumber")
      .populate("notes.createdBy", "name email phone status userNumber")
      .populate("medications.doctor", "name email phone status userNumber")
      .populate("medications.addedBy", "name email phone status userNumber")
      .lean();

    if (!patientProfile?.user?._id) {
      return res.status(404).json({ error: "Patient not found in your assignment" });
    }

    const now = new Date();
    const [futureFollowUps, followUpHistory, upcomingAppointments, appointmentHistory] = await Promise.all([
      CrmTask.find({
        patient: patientProfile.user._id,
        assignedDoctor: managedDoctor._id,
        status: { $in: ["pending", "in_progress"] },
        $or: [
          { followUpAt: { $gte: now } },
          { dueAt: { $gte: now } }
        ]
      })
        .populate("assignedDoctor", "name email phone status userNumber")
        .populate("assignedNurse", "name email phone status userNumber")
        .populate("linkedNextTask", "title status priority followUpAt dueAt")
        .populate("linkedAppointment", "scheduledAt endsAt status outcome reason")
        .populate("notes.createdBy", "name email phone status userNumber")
        .sort({ followUpAt: 1, dueAt: 1, updatedAt: -1 })
        .limit(8)
        .lean(),
      CrmTask.find({
        patient: patientProfile.user._id,
        assignedDoctor: managedDoctor._id,
        $or: [
          { followUpAt: { $lt: now } },
          { completedAt: { $ne: null, $lt: now } }
        ]
      })
        .populate("assignedDoctor", "name email phone status userNumber")
        .populate("assignedNurse", "name email phone status userNumber")
        .populate("linkedNextTask", "title status priority followUpAt dueAt")
        .populate("linkedAppointment", "scheduledAt endsAt status outcome reason")
        .populate("notes.createdBy", "name email phone status userNumber")
        .sort({ followUpAt: -1, completedAt: -1, updatedAt: -1 })
        .limit(8)
        .lean(),
      Appointment.find({
        patient: patientProfile.user._id,
        doctor: managedDoctor._id,
        scheduledAt: { $gte: now },
        status: { $nin: TERMINAL_APPOINTMENT_STATUSES }
      })
        .populate("doctor", "name email phone status userNumber")
        .populate("scheduledBy", "name email phone status userNumber")
        .sort({ scheduledAt: 1, updatedAt: -1 })
        .limit(8)
        .lean(),
      Appointment.find({
        patient: patientProfile.user._id,
        doctor: managedDoctor._id,
        $or: [
          { scheduledAt: { $lt: now } },
          { status: { $in: TERMINAL_APPOINTMENT_STATUSES } }
        ]
      })
        .populate("doctor", "name email phone status userNumber")
        .populate("scheduledBy", "name email phone status userNumber")
        .sort({ scheduledAt: -1, updatedAt: -1 })
        .limit(8)
        .lean()
    ]);

    return res.json({
      patient: {
        ...buildPatientManagementResponse({ profile: patientProfile, managedDoctor }),
        notes: Array.isArray(patientProfile.notes)
          ? patientProfile.notes.map((note) => buildPatientProfileNoteResponse(note)).filter(Boolean)
          : [],
        medications: Array.isArray(patientProfile.medications)
          ? [...patientProfile.medications]
              .sort((left, right) => new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime())
              .map((medication) => buildPatientMedicationResponse(medication))
              .filter(Boolean)
          : [],
        futureFollowUps: futureFollowUps.map((task) => buildPatientFollowUpHistoryResponse(task)).filter(Boolean),
        followUpHistory: followUpHistory.map((task) => buildPatientFollowUpHistoryResponse(task)).filter(Boolean),
        upcomingAppointments: upcomingAppointments.map((appointment) => buildPatientAppointmentHistoryResponse(appointment, patientProfile.user)).filter(Boolean),
        pastAppointments: appointmentHistory.map((appointment) => buildPatientAppointmentHistoryResponse(appointment, patientProfile.user)).filter(Boolean),
        appointmentHistory: appointmentHistory.map((appointment) => buildPatientAppointmentHistoryResponse(appointment, patientProfile.user)).filter(Boolean)
      }
    });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Failed to fetch patient profile";
    return res.status(statusCode).json({ error: message });
  }
}

export async function addNursePatientProfileNoteController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id;
    const patientId = req?.params?.patientId;
    const content = normalizeString(req?.body?.content);

    if (!nurseId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    const managedDoctor = await getManagedDoctorForNurse(nurseId);
    const patientProfileQuery = buildScopedPatientProfileQuery({
      nurseId,
      managedDoctorId: managedDoctor._id,
      patientId
    });

    const patientProfile = await PatientProfile.findOne(patientProfileQuery);

    if (!patientProfile?._id) {
      return res.status(404).json({ error: "Patient not found in your assignment" });
    }

    if (ensurePatientProfileNotesHaveIds(patientProfile)) {
      await patientProfile.save();
    }

    patientProfile.notes.push({
      content,
      createdBy: nurseId,
      createdAt: new Date(),
      updatedAt: null
    });
    patientProfile.lastInteractionAt = new Date();
    await patientProfile.save();

    const updatedProfile = await PatientProfile.findById(patientProfile._id)
      .populate("notes.createdBy", "name email phone status userNumber")
      .lean();
    const latestNote = Array.isArray(updatedProfile?.notes) ? updatedProfile.notes[updatedProfile.notes.length - 1] : null;

    return res.status(201).json({
      message: "Patient note added successfully.",
      note: buildPatientProfileNoteResponse(latestNote)
    });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Failed to add patient note";
    return res.status(statusCode).json({ error: message });
  }
}

export async function addPatientMedicationController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const medicineName = normalizeString(req?.body?.medicineName);
    const durationUnit = normalizeString(req?.body?.durationUnit).toLowerCase();
    const foodTiming = normalizeString(req?.body?.foodTiming).toLowerCase();
    const additionalInfo = normalizeString(req?.body?.additionalInfo);

    if (!medicineName) {
      return res.status(400).json({ error: "medicineName is required" });
    }

    if (!PATIENT_MEDICATION_DURATION_UNITS.includes(durationUnit)) {
      return res.status(400).json({ error: "Invalid durationUnit" });
    }

    if (!PATIENT_MEDICATION_FOOD_TIMING_OPTIONS.includes(foodTiming)) {
      return res.status(400).json({ error: "Invalid foodTiming" });
    }

    const durationValue = parseMedicationDurationValue(req?.body?.durationValue);
    const timeSlots = parseMedicationTimeSlots(req?.body?.timeSlots);
    const { patientProfile, doctorId, patientId } = await resolvePatientMedicationAccess({ actor: req });

    patientProfile.medications.push({
      medicineName,
      patient: patientId,
      doctor: doctorId,
      addedBy: req.user._id,
      durationValue,
      durationUnit,
      timeSlots,
      foodTiming,
      additionalInfo
    });
    patientProfile.lastInteractionAt = new Date();
    await patientProfile.save();

    const updatedProfile = await PatientProfile.findById(patientProfile._id)
      .populate("medications.doctor", "name email phone status userNumber")
      .populate("medications.addedBy", "name email phone status userNumber")
      .lean();
    const latestMedication = Array.isArray(updatedProfile?.medications)
      ? updatedProfile.medications[updatedProfile.medications.length - 1]
      : null;

    return res.status(201).json({
      message: "Medication added successfully.",
      medication: buildPatientMedicationResponse(latestMedication)
    });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Failed to add medication";
    return res.status(statusCode).json({ error: message });
  }
}

export async function getPatientMedicationsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const { patientProfile } = await resolvePatientMedicationAccess({ actor: req });
    const profileWithMedications = await PatientProfile.findById(patientProfile._id)
      .populate("medications.patient", "name email phone status userNumber")
      .populate("medications.doctor", "name email phone status userNumber")
      .populate("medications.addedBy", "name email phone status userNumber")
      .lean();

    const medications = Array.isArray(profileWithMedications?.medications)
      ? [...profileWithMedications.medications]
          .sort((left, right) => new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime())
          .map((medication) => buildPatientMedicationResponse(medication))
          .filter(Boolean)
      : [];
    const medicineOptions = await listMedicationNameOptions();

    return res.status(200).json({
      medications,
      medicineOptions
    });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Failed to fetch medications";
    return res.status(statusCode).json({ error: message });
  }
}

export async function updateNursePatientProfileNoteController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id;
    const patientId = req?.params?.patientId;
    const noteId = typeof req?.params?.noteId === "string" ? req.params.noteId.trim() : "";
    const content = normalizeString(req?.body?.content);
    const legacyCreatedAt = typeof req?.body?.legacyCreatedAt === "string" ? req.body.legacyCreatedAt.trim() : "";

    if (!nurseId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!noteId) {
      return res.status(400).json({ error: "noteId is required" });
    }

    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    const managedDoctor = await getManagedDoctorForNurse(nurseId);
    const patientProfileQuery = buildScopedPatientProfileQuery({
      nurseId,
      managedDoctorId: managedDoctor._id,
      patientId
    });

    const patientProfile = await PatientProfile.findOne(patientProfileQuery);

    if (!patientProfile?._id) {
      return res.status(404).json({ error: "Patient not found in your assignment" });
    }

    if (ensurePatientProfileNotesHaveIds(patientProfile)) {
      await patientProfile.save();
    }

    const targetNote = Array.isArray(patientProfile.notes)
      ? patientProfile.notes.find((note) => note?._id?.toString() === noteId)
      : null;

    const legacyTargetNote =
      targetNote || !legacyCreatedAt
        ? targetNote
        : Array.isArray(patientProfile.notes)
          ? patientProfile.notes.find((note) => {
              const noteCreatedAt = note?.createdAt ? new Date(note.createdAt).toISOString() : "";
              return noteCreatedAt && noteCreatedAt === legacyCreatedAt;
            })
          : null;

    if (!legacyTargetNote) {
      return res.status(404).json({ error: "Patient note not found" });
    }

    legacyTargetNote.content = content;
    legacyTargetNote.updatedAt = new Date();
    patientProfile.lastInteractionAt = new Date();
    await patientProfile.save();

    const updatedProfile = await PatientProfile.findById(patientProfile._id)
      .populate("notes.createdBy", "name email phone status userNumber")
      .lean();

    const updatedNote = Array.isArray(updatedProfile?.notes)
      ? updatedProfile.notes.find((note) => {
          if (note?._id?.toString() === legacyTargetNote?._id?.toString()) return true;
          if (!legacyCreatedAt) return false;
          const noteCreatedAt = note?.createdAt ? new Date(note.createdAt).toISOString() : "";
          return noteCreatedAt && noteCreatedAt === legacyCreatedAt;
        })
      : null;

    return res.json({
      message: "Patient note updated successfully.",
      note: buildPatientProfileNoteResponse(updatedNote)
    });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Failed to update patient note";
    return res.status(statusCode).json({ error: message });
  }
}

export async function updateUserController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const userId = typeof req?.params?.userId === "string" ? req.params.userId.trim() : "";
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const name = typeof req?.body?.name === "string" ? req.body.name.trim() : undefined;
    const phone = typeof req?.body?.phone === "string" ? req.body.phone.trim() : undefined;
    const hasGender = Object.prototype.hasOwnProperty.call(req?.body || {}, "gender");
    const gender = normalizeUserGender(req?.body?.gender);
    const status = typeof req?.body?.status === "string" ? req.body.status.trim() : undefined;
    const hasAssignedDoctorId = Object.prototype.hasOwnProperty.call(req?.body || {}, "assignedDoctorId");
    const assignedDoctorId = typeof req?.body?.assignedDoctorId === "string" ? req.body.assignedDoctorId.trim() : "";
    const hasAssignedDoctorIds = Object.prototype.hasOwnProperty.call(req?.body || {}, "assignedDoctorIds");
    const hasAssignedNurseIds = Object.prototype.hasOwnProperty.call(req?.body || {}, "assignedNurseIds");
    const assignedDoctorIds = req?.body?.assignedDoctorIds;
    const assignedNurseIds = req?.body?.assignedNurseIds;
    const hasAllowCustomSchedule = Object.prototype.hasOwnProperty.call(req?.body || {}, "allowCustomSchedule");
    const allowCustomSchedule = Boolean(req?.body?.allowCustomSchedule);
    const hasAge = Object.prototype.hasOwnProperty.call(req?.body || {}, "age");
    const hasReference = Object.prototype.hasOwnProperty.call(req?.body || {}, "reference");
    const hasAddress = Object.prototype.hasOwnProperty.call(req?.body || {}, "address");
    const hasSecondaryPhone = Object.prototype.hasOwnProperty.call(req?.body || {}, "secondaryPhone");
    const hasServices = Object.prototype.hasOwnProperty.call(req?.body || {}, "services");
    const hasTags = Object.prototype.hasOwnProperty.call(req?.body || {}, "tags");
    const patientAge = parsePatientAge(req?.body?.age);
    const patientReference = parsePatientTextField(req?.body?.reference);
    const patientAddress = parsePatientTextField(req?.body?.address);
    const patientSecondaryPhone = parsePatientTextField(req?.body?.secondaryPhone);
    const patientServices = normalizePatientSelection(req?.body?.services, PATIENT_SERVICE_OPTIONS);
    const patientTags = normalizePatientSelection(req?.body?.tags, PATIENT_TAG_OPTIONS);

    if (status && !USER_STATUSES_ENUM.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.role === "super_admin") return res.status(403).json({ error: "Super admin cannot be edited here" });
    const previousStatus = user.status;

    let hasChanges = false;

    if (name !== undefined && name) {
      user.name = name;
      hasChanges = true;
    }

    if (phone !== undefined) {
      user.phone = phone;
      hasChanges = true;
    }

    if (hasGender && gender.hasValue) {
      user.gender = gender.value;
      hasChanges = true;
    }

    if (status !== undefined) {
      user.status = status;
      hasChanges = true;
    }

    if (user.role === "nurse" && hasAssignedDoctorId) {
      const assignedDoctor = await findDoctorUserById(assignedDoctorId);
      await NurseProfile.findOneAndUpdate(
        { user: user._id },
        { $set: { assignedDoctor: assignedDoctor._id } },
        { upsert: true, new: true }
      );
      hasChanges = true;
    }

    if (user.role === "patient" && (hasAssignedDoctorIds || hasAssignedNurseIds || hasAge || hasReference || hasAddress || hasSecondaryPhone || hasServices || hasTags)) {
      const existingProfile = await PatientProfile.findOne({ user: user._id }).lean();
      const patientCareTeam = await resolvePatientCareTeam({
        creator: req.user,
        creatorRole: typeof req?.user?.role === "string" ? req.user.role : "",
        assignedDoctorIds: hasAssignedDoctorIds
          ? assignedDoctorIds
          : Array.isArray(existingProfile?.assignedDoctors)
            ? existingProfile.assignedDoctors.map((doctorId) => doctorId.toString())
            : [],
        assignedNurseIds: hasAssignedNurseIds
          ? assignedNurseIds
          : Array.isArray(existingProfile?.assignedNurses)
            ? existingProfile.assignedNurses.map((nurseId) => nurseId.toString())
            : []
      });

      await PatientProfile.findOneAndUpdate(
        { user: user._id },
        {
          $set: {
            assignedDoctors: patientCareTeam.assignedDoctorIds,
            assignedNurses: patientCareTeam.assignedNurseIds,
            ...(hasAge ? { age: patientAge.value } : {}),
            ...(hasReference ? { reference: patientReference.value } : {}),
            ...(hasAddress ? { address: patientAddress.value } : {}),
            ...(hasSecondaryPhone ? { secondaryPhone: patientSecondaryPhone.value } : {}),
            ...(hasServices ? { services: patientServices } : {}),
            ...(hasTags ? { tags: patientTags } : {})
          }
        },
        { upsert: true, new: true }
      );
      hasChanges = true;
    }

    if (user.role === "doctor" && hasAllowCustomSchedule) {
      await DoctorProfile.findOneAndUpdate(
        { user: user._id },
        { $set: { allowCustomSchedule } },
        { upsert: true, new: true }
      );
      hasChanges = true;
    }

    if (!hasChanges) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await user.save();
    let notifications = null;
    let notificationWarnings = [];
    let message = "User updated successfully.";

    if (previousStatus !== "blocked" && user.status === "blocked") {
      await createUserNotification({
        userId: user._id,
        createdBy: req?.user?._id || null,
        type: "account_blocked",
        title: "Account blocked",
        message: "Your account access has been blocked by an administrator."
      });
      const blockedNotifications = await sendBlockedNotifications(user);
      notifications = blockedNotifications.notifications;
      notificationWarnings = blockedNotifications.notificationWarnings;
      message =
        notificationWarnings.length === 0
          ? "User updated and blocked notifications sent."
          : "User updated, but some blocked notifications could not be delivered.";
    } else if (previousStatus === "blocked" && user.status === "active") {
      await createUserNotification({
        userId: user._id,
        createdBy: req?.user?._id || null,
        type: "account_active",
        title: "Account activated",
        message: "Your account access has been restored by an administrator."
      });
      const activeNotifications = await sendActiveNotifications(user);
      notifications = activeNotifications.notifications;
      notificationWarnings = activeNotifications.notificationWarnings;
      message =
        notificationWarnings.length === 0
          ? "User updated and active notifications sent."
          : "User updated, but some active notifications could not be delivered.";
    }

    return res.json({
      message,
      notifications,
      notificationWarnings,
      user: (await buildUsersResponse([user]))[0]
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update user";
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(statusCode).json({ error: message });
  }
}
