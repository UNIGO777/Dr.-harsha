import { Appointment } from "../Models/Appointment.js";
import { CrmTask } from "../Models/CrmTask.js";
import { DoctorProfile } from "../Models/DoctorProfile.js";
import { NurseProfile } from "../Models/NurseProfile.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { User } from "../Models/User.js";

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

function buildAppointmentResponse(appointment) {
  if (!appointment?._id) return null;

  return {
    id: appointment._id.toString(),
    scheduledAt: appointment.scheduledAt,
    endsAt: appointment.endsAt || null,
    slotMinutes: appointment.slotMinutes || null,
    reason: appointment.reason,
    status: appointment.status,
    outcome: appointment.outcome || "",
    patient: buildUserOption(appointment.patient),
    doctor: buildUserOption(appointment.doctor),
    scheduledBy: buildUserOption(appointment.scheduledBy),
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt
  };
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

async function buildDoctorAppointmentSlots({ doctor, dateValue }) {
  const { year, month, day, date, dateKey } = parseDateKey(dateValue, "date");
  const scheduleContext = await loadDoctorScheduleContext(doctor._id);
  const dayKey = getDayKeyFromDate(date);
  const daySchedule = scheduleContext.effectiveWeeklyAvailability?.[dayKey] || { enabled: false, shifts: [], breaks: [] };
  const slotMinutes = scheduleContext.hospitalDefaults.slotMinutes;
  const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
  const dayEnd = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  const existingAppointments = await Appointment.find({
    doctor: doctor._id,
    status: "scheduled",
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

async function ensureDoctorAvailability({ doctor, scheduledAt }) {
  const appointmentTime = new Date(scheduledAt);
  const slotData = await buildDoctorAppointmentSlots({
    doctor,
    dateValue: formatDateKeyFromDate(appointmentTime)
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

export async function listDoctorAppointmentSlotsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const requesterRole = typeof req?.user?.role === "string" ? req.user.role : "";
    const requesterId = req?.user?._id?.toString?.() || "";
    const requestedDoctorId = normalizeString(req?.query?.doctorId);
    const requestedPatientId = normalizeString(req?.query?.patientId);
    const doctorId = requesterRole === "doctor" ? requesterId : requestedDoctorId;
    const date = normalizeString(req?.query?.date);

    if (!doctorId) return res.status(400).json({ error: "doctorId is required" });
    if (!date) return res.status(400).json({ error: "date is required" });
    if (requesterRole === "doctor" && requestedDoctorId && requestedDoctorId !== requesterId) {
      return res.status(403).json({ error: "Doctor can only view their own slots" });
    }

    const [doctor, patient] = await Promise.all([
      findUserByRole(doctorId, "doctor", "doctor"),
      requestedPatientId ? findUserByRole(requestedPatientId, "patient", "patient") : Promise.resolve(null)
    ]);
    const [slotData, appointmentHistory] = await Promise.all([
      buildDoctorAppointmentSlots({ doctor, dateValue: date }),
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

export async function scheduleNurseAppointmentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = normalizeString(req?.body?.patientId);
    const doctorId = normalizeString(req?.body?.doctorId);
    const reason = normalizeString(req?.body?.reason);
    const scheduledAt = normalizeDate(req?.body?.scheduledAt, "scheduledAt");

    if (!patientId) return res.status(400).json({ error: "patientId is required" });
    if (!doctorId) return res.status(400).json({ error: "doctorId is required" });
    if (!scheduledAt) return res.status(400).json({ error: "scheduledAt is required" });
    if (!reason) return res.status(400).json({ error: "reason is required" });

    const [patient, doctor] = await Promise.all([
      findUserByRole(patientId, "patient", "patient"),
      findUserByRole(doctorId, "doctor", "doctor")
    ]);

    const availability = await ensureDoctorAvailability({ doctor, scheduledAt });

    const appointment = await Appointment.create({
      patient: patient._id,
      doctor: doctor._id,
      scheduledBy: nurseId,
      scheduledAt,
      endsAt: availability.endsAt,
      slotMinutes: availability.slotMinutes,
      reason,
      status: "scheduled"
    });

    await PatientProfile.findOneAndUpdate(
      { user: patient._id },
      {
        $set: {
          nextAppointmentAt: scheduledAt,
          lastInteractionAt: new Date()
        }
      },
      { new: true, upsert: true }
    );

    const populatedAppointment = await Appointment.findById(appointment._id)
      .populate("patient", "name email phone status userNumber")
      .populate("doctor", "name email phone status userNumber")
      .populate("scheduledBy", "name email phone status userNumber")
      .lean();

    return res.status(201).json({
      message: "Appointment scheduled successfully.",
      appointment: buildAppointmentResponse(populatedAppointment)
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

    const [patient, doctor] = await Promise.all([
      findUserByRole(patientId, "patient", "patient"),
      findUserByRole(doctorId, "doctor", "doctor")
    ]);

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

    await PatientProfile.findOneAndUpdate(
      { user: patient._id },
      {
        $set: {
          followUpDueAt: followUpAt,
          lastInteractionAt: new Date()
        }
      },
      { new: true, upsert: true }
    );

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
    const hasStatus = Object.prototype.hasOwnProperty.call(req?.body || {}, "status");
    const hasOutcome = Object.prototype.hasOwnProperty.call(req?.body || {}, "outcome");

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

    if (!hasStatus && !hasOutcome) {
      return res.status(400).json({ error: "At least one field is required" });
    }

    if (hasStatus) {
      const nextStatus = normalizeString(req?.body?.status).toLowerCase();
      if (!["scheduled", "completed", "cancelled"].includes(nextStatus)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      appointment.status = nextStatus;
    }

    if (hasOutcome) {
      appointment.outcome = outcome;
    }

    await appointment.save();

    const updatedAppointment = await Appointment.findById(appointment._id)
      .populate("patient", "name email phone status userNumber")
      .populate("doctor", "name email phone status userNumber")
      .populate("scheduledBy", "name email phone status userNumber")
      .lean();

    return res.json({
      message: "Appointment updated successfully.",
      appointment: buildAppointmentResponse(updatedAppointment)
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to update appointment";
    return res.status(statusCode).json({ error: message });
  }
}
