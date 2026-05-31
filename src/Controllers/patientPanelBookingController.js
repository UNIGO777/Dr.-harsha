import { PatientProfile } from "../Models/PatientProfile.js";
import { DoctorProfile } from "../Models/DoctorProfile.js";
import { Appointment } from "../Models/Appointment.js";
import { CrmTask } from "../Models/CrmTask.js";
import { Notification } from "../Models/Notification.js";

export async function listAssignedDoctorsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const profile = await PatientProfile.findOne({ user: patientId })
      .populate("assignedDoctors", "name email phone userNumber")
      .lean();

    if (!profile) return res.status(404).json({ error: "Patient profile not found" });

    const doctors = (profile.assignedDoctors || []).map((d) => ({
      id: d._id.toString(),
      name: d.name,
      email: d.email,
      phone: d.phone || ""
    }));

    return res.json({ doctors });
  } catch (err) {
    console.error("listAssignedDoctorsController error:", err);
    return res.status(500).json({ error: "Failed to load doctors" });
  }
}

export async function getAvailableSlotsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { doctorId, date } = req.query;
    if (!doctorId || !date) {
      return res.status(400).json({ error: "doctorId and date are required" });
    }

    // Verify doctor is assigned to patient
    const patientProfile = await PatientProfile.findOne({ user: patientId }).lean();
    const isAssigned = (patientProfile?.assignedDoctors || []).some((d) => d.toString() === doctorId);
    if (!isAssigned) {
      return res.status(403).json({ error: "This doctor is not assigned to you" });
    }

    const doctorProfile = await DoctorProfile.findOne({ user: doctorId }).lean();
    const weeklyAvailability = doctorProfile?.weeklyAvailability;

    if (!weeklyAvailability) {
      return res.json({ date, slots: [], message: "Doctor schedule not configured" });
    }

    const targetDate = new Date(date);
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dayName = dayNames[targetDate.getDay()];

    const daySchedule = weeklyAvailability[dayName];
    if (!daySchedule || !daySchedule.enabled) {
      return res.json({ date, slots: [], message: "Doctor is not available on this day" });
    }

    // Generate slots from shifts
    const slotDuration = 30; // minutes
    const generatedSlots = [];

    const shifts = Array.isArray(daySchedule.shifts) ? daySchedule.shifts : [];
    for (const shift of shifts) {
      if (!shift.start || !shift.end) continue;
      const [startH, startM] = shift.start.split(":").map(Number);
      const [endH, endM] = shift.end.split(":").map(Number);
      let cursor = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      while (cursor + slotDuration <= endMinutes) {
        const h = Math.floor(cursor / 60);
        const m = cursor % 60;
        generatedSlots.push({
          startTime: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
          endTime: `${String(Math.floor((cursor + slotDuration) / 60)).padStart(2, "0")}:${String((cursor + slotDuration) % 60).padStart(2, "0")}`
        });
        cursor += slotDuration;
      }
    }

    // Get existing appointments for this doctor on this date
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const existingAppointments = await Appointment.find({
      doctor: doctorId,
      scheduledAt: { $gte: dayStart, $lte: dayEnd },
      status: { $in: ["scheduled", "confirmed", "pending", "checked_in"] }
    }).select("scheduledAt endsAt").lean();

    // Filter out booked slots and past slots for today
    const now = new Date();
    const availableSlots = generatedSlots.map((slot) => {
      const slotStart = new Date(date);
      const [sh, sm] = slot.startTime.split(":").map(Number);
      slotStart.setHours(sh, sm, 0, 0);

      // If slot is in the past, mark unavailable
      if (slotStart <= now) {
        return { ...slot, available: false };
      }

      const isBooked = existingAppointments.some((apt) => {
        const aptStart = new Date(apt.scheduledAt);
        const aptEnd = new Date(apt.endsAt);
        return slotStart >= aptStart && slotStart < aptEnd;
      });

      return { ...slot, available: !isBooked };
    });

    return res.json({ date, slots: availableSlots });
  } catch (err) {
    console.error("getAvailableSlotsController error:", err);
    return res.status(500).json({ error: "Failed to load slots" });
  }
}

export async function bookAppointmentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { doctorId, date, startTime, appointmentType, reason } = req.body;

    if (!doctorId || !date || !startTime || !reason?.trim()) {
      return res.status(400).json({ error: "doctorId, date, startTime, and reason are required" });
    }

    // Verify doctor is assigned
    const patientProfile = await PatientProfile.findOne({ user: patientId }).lean();
    const isAssigned = (patientProfile?.assignedDoctors || []).some((d) => d.toString() === doctorId);
    if (!isAssigned) {
      return res.status(403).json({ error: "This doctor is not assigned to you" });
    }

    const [h, m] = startTime.split(":").map(Number);
    const scheduledAt = new Date(date);
    scheduledAt.setHours(h, m, 0, 0);

    // Must be in the future
    if (scheduledAt <= new Date()) {
      return res.status(400).json({ error: "Cannot book an appointment in the past" });
    }

    const slotMinutes = 30;
    const endsAt = new Date(scheduledAt.getTime() + slotMinutes * 60000);

    // Check slot isn't already booked
    const conflict = await Appointment.findOne({
      doctor: doctorId,
      scheduledAt: { $lt: endsAt },
      endsAt: { $gt: scheduledAt },
      status: { $in: ["scheduled", "confirmed", "pending", "checked_in"] }
    }).lean();

    if (conflict) {
      return res.status(409).json({ error: "This slot is no longer available. Please select a different time." });
    }

    const appointment = await Appointment.create({
      patient: patientId,
      doctor: doctorId,
      scheduledBy: patientId,
      scheduledAt,
      endsAt,
      slotMinutes,
      reason: reason.trim(),
      appointmentType: appointmentType || "in_person",
      status: "pending",
      notes: [{
        type: "system",
        channel: "system",
        message: "Booked by patient via self-service portal. Awaiting confirmation.",
        createdBy: patientId
      }]
    });

    // Double-check for race condition: if another booking landed in the same slot, roll back
    const duplicateCount = await Appointment.countDocuments({
      doctor: doctorId,
      scheduledAt: { $lt: endsAt },
      endsAt: { $gt: scheduledAt },
      status: { $in: ["scheduled", "confirmed", "pending", "checked_in"] }
    });
    if (duplicateCount > 1) {
      await Appointment.deleteOne({ _id: appointment._id });
      return res.status(409).json({ error: "This slot was just booked by someone else. Please select a different time." });
    }

    // Notify nurse for confirmation
    const assignedNurse = patientProfile?.assignedNurses?.[0] || null;
    if (assignedNurse) {
      await CrmTask.create({
        patient: patientId,
        assignedNurse,
        assignedDoctor: doctorId,
        title: "Confirm Patient-Booked Appointment",
        description: `Patient ${req.user.name || ""} booked appointment on ${scheduledAt.toLocaleDateString()} at ${startTime}. Reason: ${reason.trim()}`,
        category: "appointment_confirmation",
        status: "pending",
        priority: "high",
        dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000)
      });

      await Notification.create({
        user: assignedNurse,
        type: "appointment_scheduled",
        title: "Patient Booked Appointment",
        message: `${req.user.name || "Patient"} booked an appointment on ${scheduledAt.toLocaleDateString()} at ${startTime}. Please confirm.`,
        metadata: { patientId, appointmentId: appointment._id.toString() },
        createdBy: patientId
      });
    }

    return res.status(201).json({
      success: true,
      message: "Appointment booked! Your care team will confirm shortly.",
      appointment: {
        id: appointment._id.toString(),
        scheduledAt: appointment.scheduledAt,
        endsAt: appointment.endsAt,
        status: appointment.status,
        reason: appointment.reason
      }
    });
  } catch (err) {
    console.error("bookAppointmentController error:", err);
    return res.status(500).json({ error: "Failed to book appointment" });
  }
}
