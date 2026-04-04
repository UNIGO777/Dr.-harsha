import { APPOINTMENT_STATUS_ENUM, APPOINTMENT_TYPE_ENUM, Appointment } from "../Models/Appointment.js";
import { CrmTask } from "../Models/CrmTask.js";
import { DoctorProfile } from "../Models/DoctorProfile.js";
import { NurseProfile } from "../Models/NurseProfile.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { User } from "../Models/User.js";
import { sendAdminCustomEmail } from "../utils/emailService.js";
import { buildPromptSections, generateGptJson } from "../utils/gptService.js";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday"
};
const ACTIVE_APPOINTMENT_STATUSES = ["scheduled", "pending", "confirmed", "checked_in"];
const EMAIL_ACTIONS = ["reminder", "confirmation", "instructions"];

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
    throw createRequestError(`${fieldName} must be a valid date`, 400);
  }
  return parsedDate;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalizedValue)) return true;
    if (["false", "0", "no"].includes(normalizedValue)) return false;
  }
  return false;
}

function padTime(value) {
  return String(value).padStart(2, "0");
}

function normalizeTimeString(value, fieldName, allowEmpty = false) {
  const normalizedValue = typeof value === "string" ? value.trim() : "";
  if (!normalizedValue) {
    if (allowEmpty) return "";
    throw createRequestError(`${fieldName} is required`, 400);
  }

  const match = normalizedValue.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw createRequestError(`${fieldName} must be in HH:MM format`, 400);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw createRequestError(`${fieldName} must be a valid time`, 400);
  }

  return `${padTime(hours)}:${padTime(minutes)}`;
}

function parseTimeToMinutes(value, fieldName) {
  const normalizedValue = normalizeTimeString(value, fieldName);
  const [hours, minutes] = normalizedValue.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatMinutesAsTime(minutes) {
  return `${padTime(Math.floor(minutes / 60))}:${padTime(minutes % 60)}`;
}

function formatMinutesAsLabel(minutes) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(new Date(2026, 0, 1, Math.floor(minutes / 60), minutes % 60));
}

function getPositiveIntegerEnv(name, fallbackValue, minimumValue = 1) {
  const parsedValue = Number(process.env[name]);
  if (!Number.isFinite(parsedValue) || parsedValue < minimumValue) return fallbackValue;
  return Math.floor(parsedValue);
}

function parseWorkingDays(rawValue) {
  const normalizedValues = String(rawValue || DAY_KEYS.join(","))
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => DAY_KEYS.includes(value));

  return normalizedValues.length > 0 ? Array.from(new Set(normalizedValues)) : DAY_KEYS;
}

function cloneDaySchedule(daySchedule) {
  return {
    enabled: Boolean(daySchedule?.enabled),
    shifts: Array.isArray(daySchedule?.shifts) ? daySchedule.shifts.map((shift) => ({ start: shift.start, end: shift.end })) : [],
    breaks: Array.isArray(daySchedule?.breaks) ? daySchedule.breaks.map((entry) => ({ start: entry.start, end: entry.end })) : []
  };
}

function cloneWeeklyAvailability(weeklyAvailability = {}) {
  return DAY_KEYS.reduce((accumulator, dayKey) => {
    accumulator[dayKey] = cloneDaySchedule(weeklyAvailability?.[dayKey]);
    return accumulator;
  }, {});
}

function normalizeTimeRange(value, fieldPath) {
  const start = normalizeTimeString(value?.start, `${fieldPath}.start`);
  const end = normalizeTimeString(value?.end, `${fieldPath}.end`);
  const startMinutes = parseTimeToMinutes(start, `${fieldPath}.start`);
  const endMinutes = parseTimeToMinutes(end, `${fieldPath}.end`);

  if (endMinutes <= startMinutes) {
    throw createRequestError(`${fieldPath}.end must be after ${fieldPath}.start`, 400);
  }

  return { start, end };
}

function ensureNoOverlaps(ranges, fieldPath) {
  for (let index = 1; index < ranges.length; index += 1) {
    const previousRange = ranges[index - 1];
    const currentRange = ranges[index];
    if (parseTimeToMinutes(currentRange.start, `${fieldPath}.${index}.start`) < parseTimeToMinutes(previousRange.end, `${fieldPath}.${index - 1}.end`)) {
      throw createRequestError(`${fieldPath} cannot overlap`, 400);
    }
  }
}

function normalizeDaySchedule(value, dayKey, fallbackDaySchedule = null) {
  const sourceValue =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : fallbackDaySchedule && typeof fallbackDaySchedule === "object"
        ? fallbackDaySchedule
        : { enabled: false, shifts: [], breaks: [] };

  const shifts = Array.isArray(sourceValue?.shifts)
    ? sourceValue.shifts.map((shift, index) => normalizeTimeRange(shift, `${dayKey}.shifts.${index}`))
    : [];
  const breaks = Array.isArray(sourceValue?.breaks)
    ? sourceValue.breaks.map((entry, index) => normalizeTimeRange(entry, `${dayKey}.breaks.${index}`))
    : [];
  const enabled = sourceValue?.enabled !== undefined ? Boolean(sourceValue.enabled) : shifts.length > 0;

  shifts.sort((left, right) => parseTimeToMinutes(left.start, `${dayKey}.shifts.start`) - parseTimeToMinutes(right.start, `${dayKey}.shifts.start`));
  breaks.sort((left, right) => parseTimeToMinutes(left.start, `${dayKey}.breaks.start`) - parseTimeToMinutes(right.start, `${dayKey}.breaks.start`));

  ensureNoOverlaps(shifts, `${dayKey}.shifts`);
  ensureNoOverlaps(breaks, `${dayKey}.breaks`);

  if (enabled && shifts.length === 0) {
    throw createRequestError(`${DAY_LABELS[dayKey]} must have at least one shift when enabled`, 400);
  }

  for (const breakEntry of breaks) {
    const breakStart = parseTimeToMinutes(breakEntry.start, `${dayKey}.breaks.start`);
    const breakEnd = parseTimeToMinutes(breakEntry.end, `${dayKey}.breaks.end`);
    const insideShift = shifts.some((shift) => {
      const shiftStart = parseTimeToMinutes(shift.start, `${dayKey}.shifts.start`);
      const shiftEnd = parseTimeToMinutes(shift.end, `${dayKey}.shifts.end`);
      return breakStart >= shiftStart && breakEnd <= shiftEnd;
    });

    if (enabled && breaks.length > 0 && !insideShift) {
      throw createRequestError(`${DAY_LABELS[dayKey]} breaks must stay inside an enabled shift`, 400);
    }
  }

  return {
    enabled: enabled && shifts.length > 0,
    shifts,
    breaks
  };
}

function buildHospitalWeeklyAvailability() {
  const workingDays = parseWorkingDays(process.env.HOSPITAL_WORKING_DAYS);
  const openTime = normalizeTimeString(process.env.HOSPITAL_OPEN_TIME || "10:00", "HOSPITAL_OPEN_TIME");
  const closeTime = normalizeTimeString(process.env.HOSPITAL_CLOSE_TIME || "18:00", "HOSPITAL_CLOSE_TIME");
  const lunchStart = normalizeTimeString(process.env.HOSPITAL_LUNCH_START || "13:00", "HOSPITAL_LUNCH_START", true);
  const lunchEnd = normalizeTimeString(process.env.HOSPITAL_LUNCH_END || "14:00", "HOSPITAL_LUNCH_END", true);
  const slotMinutes = getPositiveIntegerEnv("APPOINTMENT_SLOT_MINUTES", 15, 5);

  const defaultShift = normalizeTimeRange({ start: openTime, end: closeTime }, "hospital.shift");
  const defaultBreaks = lunchStart && lunchEnd ? [normalizeTimeRange({ start: lunchStart, end: lunchEnd }, "hospital.lunch")] : [];
  const weeklyAvailability = DAY_KEYS.reduce((accumulator, dayKey) => {
    accumulator[dayKey] = {
      enabled: workingDays.includes(dayKey),
      shifts: workingDays.includes(dayKey) ? [defaultShift] : [],
      breaks: workingDays.includes(dayKey) ? defaultBreaks : []
    };
    return accumulator;
  }, {});

  return {
    slotMinutes,
    workingDays,
    openTime,
    closeTime,
    lunchStart,
    lunchEnd,
    weeklyAvailability
  };
}

function mergeWeeklyAvailability(sourceValue, fallbackWeeklyAvailability) {
  return DAY_KEYS.reduce((accumulator, dayKey) => {
    accumulator[dayKey] = normalizeDaySchedule(sourceValue?.[dayKey], dayKey, fallbackWeeklyAvailability?.[dayKey]);
    return accumulator;
  }, {});
}

function getDayKeyFromDate(dateValue) {
  const dayIndex = dateValue.getDay();
  return DAY_KEYS[(dayIndex + 6) % 7];
}

function parseDateKey(value, fieldName = "date") {
  const normalizedValue = normalizeString(value);
  const match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw createRequestError(`${fieldName} must be in YYYY-MM-DD format`, 400);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw createRequestError(`${fieldName} must be a valid calendar date`, 400);
  }

  return { year, month, day, date, dateKey: normalizedValue };
}

function buildDateWithMinutes({ year, month, day, minutes }) {
  return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function formatDateKeyFromDate(dateValue) {
  return `${dateValue.getFullYear()}-${padTime(dateValue.getMonth() + 1)}-${padTime(dateValue.getDate())}`;
}

function formatDateTimeLabel(dateValue) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateValue));
}

function formatAppointmentStatusLabel(status) {
  return String(status || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatAppointmentTypeLabel(type) {
  return String(type || "in_person")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function rangeOverlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function buildUserOption(user) {
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

function buildAppointmentNoteResponse(note) {
  if (!note?._id || !note?.message) return null;

  return {
    id: note._id.toString(),
    type: note.type || "note",
    channel: note.channel || "system",
    message: note.message,
    metadata: note.metadata && typeof note.metadata === "object" ? note.metadata : {},
    createdBy: buildUserOption(note.createdBy),
    createdAt: note.createdAt || null
  };
}

function buildAppointmentResponse(appointment) {
  if (!appointment?._id) return null;

  return {
    id: appointment._id.toString(),
    scheduledAt: appointment.scheduledAt,
    endsAt: appointment.endsAt || null,
    slotMinutes: appointment.slotMinutes || null,
    reason: appointment.reason,
    appointmentType: appointment.appointmentType || "in_person",
    status: appointment.status,
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
    patient: buildUserOption(appointment.patient),
    doctor: buildUserOption(appointment.doctor),
    scheduledBy: buildUserOption(appointment.scheduledBy),
    notes: Array.isArray(appointment.notes) ? appointment.notes.map((note) => buildAppointmentNoteResponse(note)).filter(Boolean) : [],
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt
  };
}

function addAppointmentNote(appointment, { type = "note", channel = "system", message, createdBy, metadata = {} }) {
  const normalizedMessage = normalizeString(message);
  if (!normalizedMessage || !createdBy) return;

  appointment.notes.push({
    type,
    channel,
    message: normalizedMessage,
    createdBy,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    createdAt: new Date()
  });
}

function buildFollowUpTaskResponse(task) {
  if (!task?._id) return null;

  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description,
    category: task.category,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    followUpAt: task.followUpAt,
    patient: buildUserOption(task.patient),
    assignedDoctor: buildUserOption(task.assignedDoctor),
    assignedNurse: buildUserOption(task.assignedNurse),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

async function listPastAppointments({ patientId = "", doctorId = "", limit = 6 }) {
  const query = {
    scheduledAt: { $lt: new Date() }
  };

  if (patientId) {
    query.patient = patientId;
  }

  if (doctorId) {
    query.doctor = doctorId;
  }

  const appointments = await Appointment.find(query)
    .sort({ scheduledAt: -1, createdAt: -1 })
    .limit(limit)
    .populate("patient", "name email phone status userNumber")
    .populate("doctor", "name email phone status userNumber")
    .populate("scheduledBy", "name email phone status userNumber")
    .lean();

  return appointments.map((appointment) => buildAppointmentResponse(appointment)).filter(Boolean);
}

async function findUserByRole(userId, role, fieldName) {
  const normalizedUserId = normalizeString(userId);

  if (!/^[a-f\d]{24}$/i.test(normalizedUserId)) {
    throw createRequestError(`Invalid ${fieldName}`, 400);
  }

  const user = await User.findOne({ _id: normalizedUserId, role }).lean();
  if (!user) {
    throw createRequestError(`${fieldName} not found`, 404);
  }

  if (user.status !== "active") {
    throw createRequestError(`${fieldName} must be active`, 400);
  }

  return user;
}

async function getManagedDoctorForNurse(nurseId) {
  const nurseProfile = await NurseProfile.findOne({ user: nurseId })
    .populate("assignedDoctor", "name email phone status userNumber")
    .lean();

  if (!nurseProfile?.assignedDoctor?._id) {
    throw createRequestError("No managed doctor linked to this nurse", 404);
  }

  return nurseProfile.assignedDoctor;
}

async function ensurePatientInNurseScope({ patientId, nurseId, managedDoctorId }) {
  const patientProfile = await PatientProfile.findOne({
    user: patientId,
    assignedDoctors: managedDoctorId,
    assignedNurses: nurseId
  }).lean();

  if (!patientProfile?._id) {
    throw createRequestError("This patient is outside your assignment scope", 403);
  }

  return patientProfile;
}

async function generateAiAppointmentInstructionDraft({
  appointment,
  patientProfile,
  nurseUser,
  managedDoctor,
  prompt,
  tone,
  extraInstructions
}) {
  const promptText = normalizeString(prompt) || "Create patient preparation instructions for this appointment.";
  const safeTone = normalizeString(tone) || "professional";
  const patientUser = appointment?.patient || null;
  const reason = normalizeString(appointment?.reason);
  const requirementSummary = [
    appointment?.documentsRequired ? "documents required" : "",
    appointment?.reportsRequired ? "reports required" : "",
    appointment?.preVisitUpdateRequired ? "pre-visit update required" : ""
  ]
    .filter(Boolean)
    .join(", ");
  const systemPrompt = [
    "You create patient preparation instructions for hospital appointments.",
    "Return valid JSON only with keys preparationInstructions and note.",
    "preparationInstructions must be patient-facing, practical, and easy to follow.",
    "note must be a short internal coordination note for the nurse and may be an empty string.",
    "Never include markdown, bullet symbols, numbering, code fences, or explanatory text outside JSON."
  ].join(" ");
  const userPrompt = buildPromptSections([
    { label: "Nurse name", value: nurseUser?.name || "Assigned nurse" },
    { label: "Managed doctor", value: managedDoctor?.name || appointment?.doctor?.name || "Assigned doctor" },
    { label: "Patient name", value: patientUser?.name || "Unknown patient" },
    { label: "Patient email", value: patientUser?.email || "Not available" },
    { label: "Patient phone", value: patientUser?.phone || "Not available" },
    { label: "Patient user number", value: patientUser?.userNumber ? String(patientUser.userNumber) : "Not assigned" },
    { label: "Patient CRM priority", value: patientProfile?.priority || "medium" },
    { label: "Appointment date", value: appointment?.scheduledAt ? new Date(appointment.scheduledAt).toISOString() : "Not scheduled" },
    { label: "Appointment type", value: appointment?.appointmentType || "in_person" },
    { label: "Appointment reason", value: reason || "General consultation" },
    { label: "Current preparation instructions", value: normalizeString(appointment?.preparationInstructions) || "None added" },
    { label: "Existing coordination note", value: Array.isArray(appointment?.notes) && appointment.notes.length > 0 ? appointment.notes[0]?.message || "None" : "None" },
    { label: "Requirement summary", value: requirementSummary || "No special requirements marked" },
    { label: "Requested tone", value: safeTone },
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

  return {
    preparationInstructions: normalizeString(data.preparationInstructions),
    note: normalizeString(data.note)
  };
}

async function syncPatientNextAppointment(patientId) {
  if (!patientId) return;

  const nextAppointment = await Appointment.findOne({
    patient: patientId,
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    scheduledAt: { $gte: new Date() }
  })
    .sort({ scheduledAt: 1, createdAt: 1 })
    .lean();

  await PatientProfile.findOneAndUpdate(
    { user: patientId },
    {
      $set: {
        nextAppointmentAt: nextAppointment?.scheduledAt || null,
        lastInteractionAt: new Date()
      }
    },
    { new: true, upsert: true }
  );
}

async function syncPatientFollowUpDueAt(patientId) {
  if (!patientId) return;

  const openTasks = await CrmTask.find({
    patient: patientId,
    status: { $in: ["pending", "in_progress"] },
    $or: [{ followUpAt: { $ne: null } }, { dueAt: { $ne: null } }]
  })
    .select("followUpAt dueAt")
    .lean();

  let nextFollowUpAt = null;

  for (const task of openTasks) {
    const checkpoints = [task?.followUpAt, task?.dueAt]
      .map((value) => (value ? new Date(value) : null))
      .filter((value) => value && !Number.isNaN(value.getTime()));

    for (const checkpoint of checkpoints) {
      if (!nextFollowUpAt || checkpoint.getTime() < nextFollowUpAt.getTime()) {
        nextFollowUpAt = checkpoint;
      }
    }
  }

  await PatientProfile.findOneAndUpdate(
    { user: patientId },
    {
      $set: {
        followUpDueAt: nextFollowUpAt,
        lastInteractionAt: new Date()
      }
    },
    { new: true, upsert: true }
  );
}

function buildAppointmentFollowUpTime(scheduledAt) {
  return new Date(new Date(scheduledAt).getTime() - 30 * 60 * 1000);
}

async function createPreAppointmentFollowUpTask({ appointment, patient, doctor, nurseId, reason }) {
  if (!appointment?._id || !patient?._id || !doctor?._id || !nurseId) return null;

  const followUpAt = buildAppointmentFollowUpTime(appointment.scheduledAt);
  const appointmentLabel = formatDateTimeLabel(appointment.scheduledAt);
  const descriptionParts = [`Call patient 30 minutes before the appointment scheduled for ${appointmentLabel}.`];

  if (reason) {
    descriptionParts.push(`Appointment reason: ${reason}.`);
  }

  const task = await CrmTask.create({
    patient: patient._id,
    assignedNurse: nurseId,
    assignedDoctor: doctor._id,
    title: `Pre-appointment follow up with ${patient.name}`,
    description: descriptionParts.join(" "),
    category: "appointment_confirmation",
    status: "pending",
    priority: "medium",
    dueAt: followUpAt,
    followUpAt,
    escalationRequired: false,
    callOutcome: "pending",
    linkedAppointment: appointment._id
  });

  await syncPatientFollowUpDueAt(patient._id);
  return task;
}

async function findOrCreateDoctorProfile(doctorId) {
  const existingProfile = await DoctorProfile.findOne({ user: doctorId }).lean();
  if (existingProfile) return existingProfile;

  const createdProfile = await DoctorProfile.create({ user: doctorId });
  return createdProfile.toObject();
}

async function loadDoctorScheduleContext(doctorId) {
  const hospitalDefaults = buildHospitalWeeklyAvailability();
  const doctorProfile = await findOrCreateDoctorProfile(doctorId);
  const customWeeklyAvailability = mergeWeeklyAvailability(doctorProfile?.weeklyAvailability || {}, hospitalDefaults.weeklyAvailability);
  const allowCustomSchedule = Boolean(doctorProfile?.allowCustomSchedule);

  return {
    doctorProfile,
    hospitalDefaults,
    allowCustomSchedule,
    usingCustomSchedule: allowCustomSchedule,
    customWeeklyAvailability,
    effectiveWeeklyAvailability: allowCustomSchedule ? customWeeklyAvailability : cloneWeeklyAvailability(hospitalDefaults.weeklyAvailability)
  };
}

function buildScheduleResponsePayload({ allowCustomSchedule, usingCustomSchedule, customWeeklyAvailability, effectiveWeeklyAvailability, hospitalDefaults }) {
  return {
    allowCustomSchedule,
    usingCustomSchedule,
    slotMinutes: hospitalDefaults.slotMinutes,
    hospitalDefaults: {
      slotMinutes: hospitalDefaults.slotMinutes,
      workingDays: hospitalDefaults.workingDays,
      openTime: hospitalDefaults.openTime,
      closeTime: hospitalDefaults.closeTime,
      lunchStart: hospitalDefaults.lunchStart || null,
      lunchEnd: hospitalDefaults.lunchEnd || null,
      weeklyAvailability: cloneWeeklyAvailability(hospitalDefaults.weeklyAvailability)
    },
    weeklyAvailability: cloneWeeklyAvailability(customWeeklyAvailability),
    effectiveWeeklyAvailability: cloneWeeklyAvailability(effectiveWeeklyAvailability)
  };
}

async function buildDoctorAppointmentSlots({ doctor, dateValue, excludeAppointmentId = "" }) {
  const { year, month, day, date, dateKey } = parseDateKey(dateValue, "date");
  const scheduleContext = await loadDoctorScheduleContext(doctor._id);
  const dayKey = getDayKeyFromDate(date);
  const daySchedule = scheduleContext.effectiveWeeklyAvailability?.[dayKey] || { enabled: false, shifts: [], breaks: [] };
  const slotMinutes = scheduleContext.hospitalDefaults.slotMinutes;
  const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
  const dayEnd = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  const existingAppointments = await Appointment.find({
    doctor: doctor._id,
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    scheduledAt: { $gte: dayStart, $lt: dayEnd }
  })
    .populate("patient", "name email phone status userNumber")
    .lean();
  const now = Date.now();
  const slots = [];

  if (daySchedule.enabled) {
    for (const shift of daySchedule.shifts) {
      const shiftStartMinutes = parseTimeToMinutes(shift.start, `${dayKey}.shifts.start`);
      const shiftEndMinutes = parseTimeToMinutes(shift.end, `${dayKey}.shifts.end`);

      for (let startMinutes = shiftStartMinutes; startMinutes + slotMinutes <= shiftEndMinutes; startMinutes += slotMinutes) {
        const endMinutes = startMinutes + slotMinutes;
        const startsAt = buildDateWithMinutes({ year, month, day, minutes: startMinutes });
        const endsAt = buildDateWithMinutes({ year, month, day, minutes: endMinutes });
        const breakMatch = daySchedule.breaks.find((entry) =>
          rangeOverlaps(
            startMinutes,
            endMinutes,
            parseTimeToMinutes(entry.start, `${dayKey}.breaks.start`),
            parseTimeToMinutes(entry.end, `${dayKey}.breaks.end`)
          )
        );
        const appointmentMatch = existingAppointments.find((appointment) => {
          if (excludeAppointmentId && appointment?._id?.toString?.() === excludeAppointmentId) return false;
          const appointmentStart = new Date(appointment.scheduledAt);
          const appointmentEnd = appointment.endsAt ? new Date(appointment.endsAt) : new Date(appointmentStart.getTime() + (appointment.slotMinutes || slotMinutes) * 60 * 1000);
          return rangeOverlaps(startsAt.getTime(), endsAt.getTime(), appointmentStart.getTime(), appointmentEnd.getTime());
        });

        let available = true;
        let reason = "";

        if (startsAt.getTime() <= now) {
          available = false;
          reason = "Past time";
        } else if (breakMatch) {
          available = false;
          reason = "Break time";
        } else if (appointmentMatch) {
          available = false;
          reason = appointmentMatch?.patient?.name ? `Booked with ${appointmentMatch.patient.name}` : "Already booked";
        }

        slots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          startTime: formatMinutesAsTime(startMinutes),
          endTime: formatMinutesAsTime(endMinutes),
          label: `${formatMinutesAsLabel(startMinutes)} - ${formatMinutesAsLabel(endMinutes)}`,
          available,
          reason
        });
      }
    }
  }

  return {
    doctor: buildUserOption(doctor),
    date: dateKey,
    dayKey,
    dayLabel: DAY_LABELS[dayKey],
    slotMinutes,
    allowCustomSchedule: scheduleContext.allowCustomSchedule,
    source: scheduleContext.usingCustomSchedule ? "doctor_custom" : "hospital_default",
    schedule: buildScheduleResponsePayload(scheduleContext),
    slots
  };
}

async function ensureDoctorAvailability({ doctor, scheduledAt, excludeAppointmentId = "" }) {
  const appointmentTime = new Date(scheduledAt);
  const slotData = await buildDoctorAppointmentSlots({
    doctor,
    dateValue: formatDateKeyFromDate(appointmentTime),
    excludeAppointmentId
  });
  const matchingSlot = slotData.slots.find((slot) => new Date(slot.startsAt).getTime() === appointmentTime.getTime());

  if (!matchingSlot) {
    throw createRequestError("Selected appointment time does not match an available slot", 400);
  }

  if (!matchingSlot.available) {
    throw createRequestError(matchingSlot.reason || "Selected slot is not available", 409);
  }

  return {
    slotMinutes: slotData.slotMinutes,
    endsAt: new Date(matchingSlot.endsAt)
  };
}

function buildViewWindow(dateValue, viewMode) {
  const baseDate = new Date(dateValue);
  baseDate.setHours(0, 0, 0, 0);
  const startDate = new Date(baseDate);
  const endDate = new Date(baseDate);

  if (viewMode === "weekly") {
    const dayIndex = startDate.getDay();
    const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
    startDate.setDate(startDate.getDate() + mondayOffset);
    endDate.setTime(startDate.getTime());
    endDate.setDate(endDate.getDate() + 7);
  } else {
    endDate.setDate(endDate.getDate() + 1);
  }

  return {
    view: viewMode === "weekly" ? "weekly" : "daily",
    startDate,
    endDate,
    startKey: formatDateKeyFromDate(startDate),
    endKey: formatDateKeyFromDate(new Date(endDate.getTime() - 1))
  };
}

function buildUpcomingAppointmentsSummary(appointments) {
  const summary = {
    total: appointments.length,
    pendingConfirmation: 0,
    confirmed: 0,
    checkedIn: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
    docsNeeded: 0,
    needsAttention: 0,
    overdueConfirmations: 0
  };
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  summary.today = appointments.filter((appointment) => {
    const scheduledTime = new Date(appointment.scheduledAt).getTime();
    return scheduledTime >= todayStart.getTime() && scheduledTime < todayEnd.getTime();
  }).length;

  for (const appointment of appointments) {
    const status = appointment.status || "pending";
    if (status === "scheduled" || status === "pending") summary.pendingConfirmation += 1;
    if (status === "confirmed") summary.confirmed += 1;
    if (status === "checked_in") summary.checkedIn += 1;
    if (status === "completed") summary.completed += 1;
    if (status === "cancelled") summary.cancelled += 1;
    if (status === "no_show") summary.noShow += 1;
    if (appointment.documentsRequired || appointment.reportsRequired || appointment.preVisitUpdateRequired) summary.docsNeeded += 1;

    const scheduledTime = new Date(appointment.scheduledAt).getTime();
    const requiresConfirmation = status === "scheduled" || status === "pending";
    const isSoon = scheduledTime > now && scheduledTime - now <= 24 * 60 * 60 * 1000;
    if (requiresConfirmation && isSoon) summary.overdueConfirmations += 1;
    if (requiresConfirmation || appointment.documentsRequired || appointment.reportsRequired || appointment.preVisitUpdateRequired) {
      summary.needsAttention += 1;
    }
  }

  return summary;
}

function buildAppointmentEmailContent({ actionType, appointment, managedDoctor }) {
  const appointmentDateLabel = formatDateTimeLabel(appointment.scheduledAt);
  const doctorName = managedDoctor?.name || appointment?.doctor?.name || "your doctor";
  const patientName = appointment?.patient?.name || "Patient";
  const appointmentTypeLabel = formatAppointmentTypeLabel(appointment.appointmentType);
  const subjectByAction = {
    booked: `Your appointment has been booked for ${appointmentDateLabel}`,
    reminder: `Appointment reminder for ${appointmentDateLabel}`,
    confirmation: `Appointment confirmation for ${appointmentDateLabel}`,
    instructions: `Preparation instructions for your appointment on ${appointmentDateLabel}`
  };

  const messageByAction = {
    booked: `Dear ${patientName},\n\nYour ${appointmentTypeLabel.toLowerCase()} with Dr. ${doctorName} has been booked for ${appointmentDateLabel}.\nReason: ${appointment.reason || "General consultation"}.\nStatus: ${formatAppointmentStatusLabel(appointment.status)}.\n\nPlease keep this email for your reference and contact the clinic if you need any changes.`,
    reminder: `Dear ${patientName},\n\nThis is a reminder for your ${appointmentTypeLabel.toLowerCase()} with Dr. ${doctorName} on ${appointmentDateLabel}.\nReason: ${appointment.reason || "General consultation"}.\n\nPlease arrive on time and contact the clinic if you need any changes.`,
    confirmation: `Dear ${patientName},\n\nYour ${appointmentTypeLabel.toLowerCase()} with Dr. ${doctorName} is confirmed for ${appointmentDateLabel}.\nReason: ${appointment.reason || "General consultation"}.\n\nPlease keep this message for your reference.`,
    instructions: `Dear ${patientName},\n\nHere are the preparation instructions for your ${appointmentTypeLabel.toLowerCase()} with Dr. ${doctorName} on ${appointmentDateLabel}.\n${appointment.preparationInstructions || "Please arrive 10 minutes early and carry any previous reports, prescription files, and ID proof."}\n\nRequired items:\n- Documents required: ${appointment.documentsRequired ? "Yes" : "No"}\n- Reports required: ${appointment.reportsRequired ? "Yes" : "No"}\n- Pre-visit update required: ${appointment.preVisitUpdateRequired ? "Yes" : "No"}`
  };

  return {
    subject: subjectByAction[actionType] || `Appointment update for ${appointmentDateLabel}`,
    message: messageByAction[actionType] || `Appointment update for ${appointmentDateLabel}`,
    summary: `Doctor: Dr. ${doctorName}\nDate: ${appointmentDateLabel}\nType: ${appointmentTypeLabel}\nStatus: ${formatAppointmentStatusLabel(appointment.status)}`
  };
}

export async function listDoctorAppointmentSlotsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const requesterRole = typeof req?.user?.role === "string" ? req.user.role : "";
    const requesterId = req?.user?._id?.toString?.() || "";
    const requestedDoctorId = normalizeString(req?.query?.doctorId);
    const requestedPatientId = normalizeString(req?.query?.patientId);
    const excludeAppointmentId = normalizeString(req?.query?.excludeAppointmentId);
    const doctorId = requesterRole === "doctor" ? requesterId : requestedDoctorId;
    const date = normalizeString(req?.query?.date);

    if (!doctorId) return res.status(400).json({ error: "doctorId is required" });
    if (!date) return res.status(400).json({ error: "date is required" });
    if (requesterRole === "doctor" && requestedDoctorId && requestedDoctorId !== requesterId) {
      return res.status(403).json({ error: "Doctor can only view their own slots" });
    }

    if (requesterRole === "nurse") {
      const managedDoctor = await getManagedDoctorForNurse(requesterId);
      if (managedDoctor?._id?.toString?.() !== doctorId) {
        return res.status(403).json({ error: "You can only view slots for your managed doctor" });
      }
      if (requestedPatientId) {
        await ensurePatientInNurseScope({ patientId: requestedPatientId, nurseId: requesterId, managedDoctorId: managedDoctor._id });
      }
    }

    const [doctor, patient] = await Promise.all([
      findUserByRole(doctorId, "doctor", "doctor"),
      requestedPatientId ? findUserByRole(requestedPatientId, "patient", "patient") : Promise.resolve(null)
    ]);
    const [slotData, appointmentHistory] = await Promise.all([
      buildDoctorAppointmentSlots({ doctor, dateValue: date, excludeAppointmentId }),
      requestedPatientId ? listPastAppointments({ patientId: patient?._id, doctorId: doctor._id, limit: 6 }) : Promise.resolve([])
    ]);

    return res.json({
      ...slotData,
      appointmentHistory,
      historyContext: patient ? { patient: buildUserOption(patient), doctor: buildUserOption(doctor) } : null
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to load appointment slots";
    return res.status(statusCode).json({ error: message });
  }
}

export async function getDoctorScheduleController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const doctorId = req?.user?._id?.toString?.() || "";
    if (!doctorId) return res.status(401).json({ error: "Unauthorized" });

    await findUserByRole(doctorId, "doctor", "doctor");
    const scheduleContext = await loadDoctorScheduleContext(doctorId);

    return res.json({
      schedule: buildScheduleResponsePayload(scheduleContext)
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to load doctor schedule";
    return res.status(statusCode).json({ error: message });
  }
}

export async function updateDoctorScheduleController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const doctorId = req?.user?._id?.toString?.() || "";
    if (!doctorId) return res.status(401).json({ error: "Unauthorized" });

    await findUserByRole(doctorId, "doctor", "doctor");
    const scheduleContext = await loadDoctorScheduleContext(doctorId);

    if (!scheduleContext.allowCustomSchedule) {
      return res.status(403).json({ error: "Super admin has not enabled custom schedule for this doctor" });
    }

    const weeklyAvailability = mergeWeeklyAvailability(req?.body?.weeklyAvailability || {}, scheduleContext.customWeeklyAvailability);

    await DoctorProfile.findOneAndUpdate(
      { user: doctorId },
      {
        $set: {
          allowCustomSchedule: true,
          weeklyAvailability
        }
      },
      { new: true, upsert: true }
    );

    const updatedContext = await loadDoctorScheduleContext(doctorId);

    return res.json({
      message: "Doctor schedule updated successfully.",
      schedule: buildScheduleResponsePayload(updatedContext)
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to update doctor schedule";
    return res.status(statusCode).json({ error: message });
  }
}

export async function listNurseUpcomingAppointmentsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const managedDoctor = await getManagedDoctorForNurse(nurseId);
    const search = normalizeString(req?.query?.search).toLowerCase();
    const selectedPatientId = normalizeString(req?.query?.patientId);
    const selectedStatus = normalizeString(req?.query?.status).toLowerCase();
    const selectedType = normalizeString(req?.query?.appointmentType).toLowerCase();
    const viewMode = normalizeString(req?.query?.view).toLowerCase() === "weekly" ? "weekly" : "daily";
    const referenceDate = normalizeString(req?.query?.date) || formatDateKeyFromDate(new Date());

    if (selectedStatus && !APPOINTMENT_STATUS_ENUM.includes(selectedStatus)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    if (selectedType && !APPOINTMENT_TYPE_ENUM.includes(selectedType)) {
      return res.status(400).json({ error: "Invalid appointmentType" });
    }

    if (selectedPatientId) {
      await ensurePatientInNurseScope({ patientId: selectedPatientId, nurseId, managedDoctorId: managedDoctor._id });
    }

    const patientProfiles = await PatientProfile.find({
      assignedDoctors: managedDoctor._id,
      assignedNurses: nurseId
    })
      .populate("user", "name email phone status userNumber")
      .sort({ updatedAt: -1 })
      .lean();

    const scopedPatients = patientProfiles
      .map((profile) => buildUserOption(profile.user))
      .filter(Boolean);
    const scopedPatientIds = scopedPatients.map((patient) => patient.id);
    const viewWindow = buildViewWindow(parseDateKey(referenceDate, "date").date, viewMode);
    const appointments = await Appointment.find({
      doctor: managedDoctor._id,
      patient: { $in: scopedPatientIds },
      scheduledAt: { $gte: viewWindow.startDate, $lt: viewWindow.endDate },
      ...(selectedPatientId ? { patient: selectedPatientId } : {}),
      ...(selectedStatus ? { status: selectedStatus } : {}),
      ...(selectedType ? { appointmentType: selectedType } : {})
    })
      .sort({ scheduledAt: 1, createdAt: 1 })
      .populate("patient", "name email phone status userNumber")
      .populate("doctor", "name email phone status userNumber")
      .populate("scheduledBy", "name email phone status userNumber")
      .populate("notes.createdBy", "name email phone status userNumber")
      .lean();

    const filteredAppointments = appointments.filter((appointment) => {
      if (!search) return true;

      const haystack = [
        appointment?.patient?.name,
        appointment?.patient?.email,
        appointment?.patient?.phone,
        appointment?.doctor?.name,
        appointment?.reason,
        appointment?.outcome,
        appointment?.preparationInstructions
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });

    const appointmentResponses = filteredAppointments.map((appointment) => buildAppointmentResponse(appointment)).filter(Boolean);

    return res.json({
      appointments: appointmentResponses,
      summary: buildUpcomingAppointmentsSummary(appointmentResponses),
      filters: {
        date: referenceDate,
        view: viewWindow.view,
        rangeStart: viewWindow.startDate,
        rangeEnd: new Date(viewWindow.endDate.getTime() - 1)
      },
      options: {
        patients: scopedPatients,
        doctors: [buildUserOption(managedDoctor)].filter(Boolean),
        statuses: APPOINTMENT_STATUS_ENUM.map((value) => ({ value, label: formatAppointmentStatusLabel(value) })),
        appointmentTypes: APPOINTMENT_TYPE_ENUM.map((value) => ({ value, label: formatAppointmentTypeLabel(value) }))
      },
      context: {
        managedDoctor: buildUserOption(managedDoctor)
      }
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to load upcoming appointments";
    return res.status(statusCode).json({ error: message });
  }
}

export async function generateNurseAppointmentInstructionDraftController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const appointmentId = normalizeString(req?.params?.appointmentId);
    const prompt = normalizeString(req?.body?.prompt);
    const tone = normalizeString(req?.body?.tone);
    const extraInstructions = normalizeString(req?.body?.extraInstructions);

    if (!/^[a-f\d]{24}$/i.test(appointmentId)) {
      return res.status(400).json({ error: "Invalid appointmentId" });
    }

    const managedDoctor = await getManagedDoctorForNurse(nurseId);
    const appointment = await Appointment.findOne({ _id: appointmentId })
      .populate("patient", "name email phone status userNumber")
      .populate("doctor", "name email phone status userNumber")
      .populate("scheduledBy", "name email phone status userNumber")
      .populate("notes.createdBy", "name email phone status userNumber")
      .lean();

    if (!appointment?._id) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (appointment.doctor?._id?.toString?.() !== managedDoctor._id?.toString?.()) {
      return res.status(403).json({ error: "This appointment is outside your assignment scope" });
    }

    const patientProfile = await ensurePatientInNurseScope({
      patientId: appointment.patient?._id?.toString?.() || "",
      nurseId,
      managedDoctorId: managedDoctor._id
    });

    const draft = await generateAiAppointmentInstructionDraft({
      appointment,
      patientProfile,
      nurseUser: req.user,
      managedDoctor,
      prompt,
      tone,
      extraInstructions
    });

    return res.json({
      message: "AI instructions generated successfully.",
      draft,
      appointment: buildAppointmentResponse(appointment),
      context: {
        managedDoctor: buildUserOption(managedDoctor)
      }
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to generate appointment instructions";
    return res.status(statusCode).json({ error: message });
  }
}

export async function scheduleNurseAppointmentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = normalizeString(req?.body?.patientId);
    const doctorId = normalizeString(req?.body?.doctorId);
    const reason = normalizeString(req?.body?.reason);
    const scheduledAt = normalizeDate(req?.body?.scheduledAt, "scheduledAt");
    const appointmentType = normalizeString(req?.body?.appointmentType).toLowerCase() || "in_person";
    const preparationInstructions = normalizeString(req?.body?.preparationInstructions);
    const documentsRequired = normalizeBoolean(req?.body?.documentsRequired);
    const reportsRequired = normalizeBoolean(req?.body?.reportsRequired);
    const preVisitUpdateRequired = normalizeBoolean(req?.body?.preVisitUpdateRequired);

    if (!patientId) return res.status(400).json({ error: "patientId is required" });
    if (!doctorId) return res.status(400).json({ error: "doctorId is required" });
    if (!scheduledAt) return res.status(400).json({ error: "scheduledAt is required" });
    if (!reason) return res.status(400).json({ error: "reason is required" });
    if (!APPOINTMENT_TYPE_ENUM.includes(appointmentType)) {
      return res.status(400).json({ error: "Invalid appointmentType" });
    }

    const managedDoctor = await getManagedDoctorForNurse(nurseId);
    if (managedDoctor?._id?.toString?.() !== doctorId) {
      return res.status(403).json({ error: "You can only create appointments for your managed doctor" });
    }

    const [patient, doctor] = await Promise.all([
      findUserByRole(patientId, "patient", "patient"),
      findUserByRole(doctorId, "doctor", "doctor")
    ]);
    await ensurePatientInNurseScope({ patientId: patient._id, nurseId, managedDoctorId: managedDoctor._id });

    const availability = await ensureDoctorAvailability({ doctor, scheduledAt });

    const appointment = await Appointment.create({
      patient: patient._id,
      doctor: doctor._id,
      scheduledBy: nurseId,
      scheduledAt,
      endsAt: availability.endsAt,
      slotMinutes: availability.slotMinutes,
      reason,
      appointmentType,
      status: "pending",
      preparationInstructions,
      documentsRequired,
      reportsRequired,
      preVisitUpdateRequired,
      notes: [
        {
          type: "system",
          channel: "desk",
          message: `Appointment created for ${formatDateTimeLabel(scheduledAt)} as ${formatAppointmentTypeLabel(appointmentType)}.`,
          createdBy: nurseId,
          metadata: {
            status: "pending",
            appointmentType,
            reason
          },
          createdAt: new Date()
        }
      ]
    });

    await createPreAppointmentFollowUpTask({
      appointment,
      patient,
      doctor,
      nurseId,
      reason
    });
    await syncPatientNextAppointment(patient._id);

    const warnings = [];
    if (!patient.email) {
      warnings.push("Patient email is not available for appointment booking email.");
    } else {
      try {
        const emailContent = buildAppointmentEmailContent({
          actionType: "booked",
          appointment: {
            ...appointment.toObject(),
            patient,
            doctor
          },
          managedDoctor: doctor
        });

        await sendAdminCustomEmail({
          toEmail: patient.email,
          name: patient.name,
          role: "patient",
          subject: emailContent.subject,
          message: emailContent.message,
          summary: emailContent.summary,
          userNumber: patient.userNumber
        });

        appointment.confirmationSentAt = new Date();
        appointment.lastReminderType = "booked";
        addAppointmentNote(appointment, {
          type: "confirmation",
          channel: "email",
          message: "Appointment booking email sent to patient.",
          createdBy: nurseId,
          metadata: { actionType: "booked" }
        });
        await appointment.save();
      } catch (emailError) {
        warnings.push(emailError instanceof Error ? emailError.message : "Failed to send appointment booking email");
      }
    }

    const populatedAppointment = await Appointment.findById(appointment._id)
      .populate("patient", "name email phone status userNumber")
      .populate("doctor", "name email phone status userNumber")
      .populate("scheduledBy", "name email phone status userNumber")
      .populate("notes.createdBy", "name email phone status userNumber")
      .lean();

    return res.status(201).json({
      message: warnings.length === 0 ? "Appointment scheduled successfully." : "Appointment scheduled with warnings.",
      appointment: buildAppointmentResponse(populatedAppointment),
      warnings
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to schedule appointment";
    return res.status(statusCode).json({ error: message });
  }
}

export async function scheduleNurseFollowUpController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = normalizeString(req?.body?.patientId);
    const doctorId = normalizeString(req?.body?.doctorId);
    const reason = normalizeString(req?.body?.reason);
    const followUpAt = normalizeDate(req?.body?.followUpAt, "followUpAt");
    const priority = ["low", "medium", "high", "critical"].includes(req?.body?.priority) ? req.body.priority : "medium";

    if (!patientId) return res.status(400).json({ error: "patientId is required" });
    if (!doctorId) return res.status(400).json({ error: "doctorId is required" });
    if (!followUpAt) return res.status(400).json({ error: "followUpAt is required" });
    if (!reason) return res.status(400).json({ error: "reason is required" });

    const managedDoctor = await getManagedDoctorForNurse(nurseId);
    if (managedDoctor?._id?.toString?.() !== doctorId) {
      return res.status(403).json({ error: "You can only create follow-ups for your managed doctor" });
    }

    const [patient, doctor] = await Promise.all([
      findUserByRole(patientId, "patient", "patient"),
      findUserByRole(doctorId, "doctor", "doctor")
    ]);
    await ensurePatientInNurseScope({ patientId: patient._id, nurseId, managedDoctorId: managedDoctor._id });

    const title = `Follow up with ${patient.name}`;

    const task = await CrmTask.create({
      patient: patient._id,
      assignedNurse: nurseId,
      assignedDoctor: doctor._id,
      title,
      description: reason,
      category: "appointment_confirmation",
      status: "pending",
      priority,
      dueAt: followUpAt,
      followUpAt,
      escalationRequired: false,
      callOutcome: "pending"
    });

    await syncPatientFollowUpDueAt(patient._id);

    const populatedTask = await CrmTask.findById(task._id)
      .populate("patient", "name email phone status userNumber")
      .populate("assignedDoctor", "name email phone status userNumber")
      .populate("assignedNurse", "name email phone status userNumber")
      .lean();

    return res.status(201).json({
      message: "Follow up scheduled successfully.",
      task: buildFollowUpTaskResponse(populatedTask)
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to schedule follow up";
    return res.status(statusCode).json({ error: message });
  }
}

export async function updateNurseAppointmentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id?.toString?.() || "";
    const appointmentId = normalizeString(req?.params?.appointmentId);
    const outcome = normalizeString(req?.body?.outcome);
    const reason = normalizeString(req?.body?.reason);
    const status = normalizeString(req?.body?.status).toLowerCase();
    const scheduledAt = Object.prototype.hasOwnProperty.call(req?.body || {}, "scheduledAt")
      ? normalizeDate(req?.body?.scheduledAt, "scheduledAt")
      : null;
    const appointmentType = Object.prototype.hasOwnProperty.call(req?.body || {}, "appointmentType")
      ? normalizeString(req?.body?.appointmentType).toLowerCase()
      : "";
    const preparationInstructions = Object.prototype.hasOwnProperty.call(req?.body || {}, "preparationInstructions")
      ? normalizeString(req?.body?.preparationInstructions)
      : "";
    const noteMessage = normalizeString(req?.body?.note);
    const actionType = normalizeString(req?.body?.actionType).toLowerCase();
    const hasStatus = Object.prototype.hasOwnProperty.call(req?.body || {}, "status");
    const hasOutcome = Object.prototype.hasOwnProperty.call(req?.body || {}, "outcome");
    const hasReason = Object.prototype.hasOwnProperty.call(req?.body || {}, "reason");
    const hasScheduledAt = Object.prototype.hasOwnProperty.call(req?.body || {}, "scheduledAt");
    const hasAppointmentType = Object.prototype.hasOwnProperty.call(req?.body || {}, "appointmentType");
    const hasPreparationInstructions = Object.prototype.hasOwnProperty.call(req?.body || {}, "preparationInstructions");
    const hasDocumentsRequired = Object.prototype.hasOwnProperty.call(req?.body || {}, "documentsRequired");
    const hasReportsRequired = Object.prototype.hasOwnProperty.call(req?.body || {}, "reportsRequired");
    const hasPreVisitUpdateRequired = Object.prototype.hasOwnProperty.call(req?.body || {}, "preVisitUpdateRequired");
    const hasNote = Object.prototype.hasOwnProperty.call(req?.body || {}, "note");
    const hasActionType = Object.prototype.hasOwnProperty.call(req?.body || {}, "actionType");
    const nextDocumentsRequired = hasDocumentsRequired ? normalizeBoolean(req?.body?.documentsRequired) : false;
    const nextReportsRequired = hasReportsRequired ? normalizeBoolean(req?.body?.reportsRequired) : false;
    const nextPreVisitUpdateRequired = hasPreVisitUpdateRequired ? normalizeBoolean(req?.body?.preVisitUpdateRequired) : false;

    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });
    if (!/^[a-f\d]{24}$/i.test(appointmentId)) {
      return res.status(400).json({ error: "Invalid appointmentId" });
    }

    const nurseProfile = await NurseProfile.findOne({ user: nurseId })
      .populate("assignedDoctor", "name email phone status userNumber")
      .lean();
    const managedDoctorId = nurseProfile?.assignedDoctor?._id?.toString?.() || "";

    if (!managedDoctorId) {
      return res.status(404).json({ error: "No managed doctor linked to this nurse" });
    }

    const appointment = await Appointment.findById(appointmentId)
      .populate("patient", "name email phone status userNumber")
      .populate("doctor", "name email phone status userNumber")
      .populate("scheduledBy", "name email phone status userNumber");

    if (!appointment?._id) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (appointment.doctor?._id?.toString?.() !== managedDoctorId) {
      return res.status(403).json({ error: "You can update only appointments for your managed doctor" });
    }

    const patientProfile = await PatientProfile.findOne({
      user: appointment.patient?._id,
      assignedDoctors: appointment.doctor?._id,
      assignedNurses: nurseId
    }).lean();

    if (!patientProfile?._id) {
      return res.status(403).json({ error: "This patient is outside your assignment scope" });
    }

    if (
      !hasStatus &&
      !hasOutcome &&
      !hasReason &&
      !hasScheduledAt &&
      !hasAppointmentType &&
      !hasPreparationInstructions &&
      !hasDocumentsRequired &&
      !hasReportsRequired &&
      !hasPreVisitUpdateRequired &&
      !hasNote &&
      !hasActionType
    ) {
      return res.status(400).json({ error: "At least one field is required" });
    }

    if (hasStatus) {
      if (!APPOINTMENT_STATUS_ENUM.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      appointment.status = status;
      if (status === "checked_in") appointment.checkedInAt = new Date();
      if (status === "completed") appointment.completedAt = new Date();
      if (status === "cancelled") appointment.cancelledAt = new Date();
      if (status === "no_show") appointment.noShowAt = new Date();
      if (["scheduled", "pending", "confirmed"].includes(status)) {
        appointment.checkedInAt = null;
        appointment.completedAt = null;
        appointment.cancelledAt = null;
        appointment.noShowAt = null;
      }
      addAppointmentNote(appointment, {
        type: "status",
        channel: "system",
        message: `Appointment status changed to ${formatAppointmentStatusLabel(status)}.`,
        createdBy: nurseId,
        metadata: { status }
      });
    }

    if (hasOutcome) {
      appointment.outcome = outcome;
      if (outcome) {
        addAppointmentNote(appointment, {
          type: "note",
          channel: "desk",
          message: `Outcome updated: ${outcome}`,
          createdBy: nurseId,
          metadata: { outcome }
        });
      }
    }

    if (hasReason) {
      if (!reason) return res.status(400).json({ error: "reason is required" });
      appointment.reason = reason;
    }

    if (hasAppointmentType) {
      if (!APPOINTMENT_TYPE_ENUM.includes(appointmentType)) {
        return res.status(400).json({ error: "Invalid appointmentType" });
      }
      appointment.appointmentType = appointmentType;
    }

    if (hasPreparationInstructions) {
      appointment.preparationInstructions = preparationInstructions;
    }

    if (hasDocumentsRequired) appointment.documentsRequired = nextDocumentsRequired;
    if (hasReportsRequired) appointment.reportsRequired = nextReportsRequired;
    if (hasPreVisitUpdateRequired) appointment.preVisitUpdateRequired = nextPreVisitUpdateRequired;

    if (hasScheduledAt) {
      if (!scheduledAt) return res.status(400).json({ error: "scheduledAt is required" });
      const availability = await ensureDoctorAvailability({
        doctor: appointment.doctor,
        scheduledAt,
        excludeAppointmentId: appointment._id.toString()
      });
      appointment.scheduledAt = scheduledAt;
      appointment.endsAt = availability.endsAt;
      appointment.slotMinutes = availability.slotMinutes;
      addAppointmentNote(appointment, {
        type: "reschedule",
        channel: "desk",
        message: `Appointment rescheduled to ${formatDateTimeLabel(scheduledAt)}.`,
        createdBy: nurseId,
        metadata: { scheduledAt }
      });
    }

    if (hasNote && noteMessage) {
      addAppointmentNote(appointment, {
        type: "note",
        channel: "desk",
        message: noteMessage,
        createdBy: nurseId
      });
    }

    const warnings = [];
    if (hasActionType) {
      if (!EMAIL_ACTIONS.includes(actionType)) {
        return res.status(400).json({ error: "Invalid actionType" });
      }

      if (!appointment.patient?.email) {
        warnings.push("Patient email is not available for this action.");
      } else {
        try {
          const emailContent = buildAppointmentEmailContent({ actionType, appointment, managedDoctor: appointment.doctor });
          await sendAdminCustomEmail({
            toEmail: appointment.patient.email,
            name: appointment.patient.name,
            role: "patient",
            subject: emailContent.subject,
            message: emailContent.message,
            summary: emailContent.summary,
            userNumber: appointment.patient.userNumber
          });

          if (actionType === "confirmation") {
            appointment.confirmationSentAt = new Date();
            if (appointment.status === "pending" || appointment.status === "scheduled") {
              appointment.status = "confirmed";
            }
          } else {
            appointment.lastReminderAt = new Date();
          }

          appointment.lastReminderType = actionType;
          addAppointmentNote(appointment, {
            type: actionType === "instructions" ? "instruction" : actionType,
            channel: "email",
            message: `${formatAppointmentTypeLabel(actionType)} email sent to patient.`,
            createdBy: nurseId,
            metadata: { actionType }
          });
        } catch (emailError) {
          warnings.push(emailError instanceof Error ? emailError.message : "Failed to send email");
        }
      }
    }

    await appointment.save();
    await syncPatientNextAppointment(appointment.patient?._id);

    const updatedAppointment = await Appointment.findById(appointment._id)
      .populate("patient", "name email phone status userNumber")
      .populate("doctor", "name email phone status userNumber")
      .populate("scheduledBy", "name email phone status userNumber")
      .populate("notes.createdBy", "name email phone status userNumber")
      .lean();

    return res.json({
      message: warnings.length === 0 ? "Appointment updated successfully." : "Appointment updated with warnings.",
      warnings,
      appointment: buildAppointmentResponse(updatedAppointment)
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to update appointment";
    return res.status(statusCode).json({ error: message });
  }
}
