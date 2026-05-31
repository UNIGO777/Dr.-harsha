import { Appointment } from "../Models/Appointment.js";
import { CrmTask } from "../Models/CrmTask.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { User } from "../Models/User.js";
import { Notification } from "../Models/Notification.js";
import { sendPlainNotificationEmail } from "../utils/emailService.js";

function buildAppointmentResponse(apt) {
  if (!apt?._id) return null;
  return {
    id: apt._id.toString(),
    scheduledAt: apt.scheduledAt,
    endsAt: apt.endsAt,
    slotMinutes: apt.slotMinutes,
    reason: apt.reason,
    appointmentType: apt.appointmentType,
    status: apt.status,
    outcome: apt.outcome || "",
    preparationInstructions: apt.preparationInstructions || "",
    doctor: apt.doctor
      ? { id: apt.doctor._id.toString(), name: apt.doctor.name, phone: apt.doctor.phone || "" }
      : null,
    notes: (apt.notes || [])
      .filter((n) => n.type === "instruction" || n.type === "note")
      .map((n) => ({ type: n.type, message: n.message, createdAt: n.createdAt })),
    completedAt: apt.completedAt,
    cancelledAt: apt.cancelledAt,
    createdAt: apt.createdAt
  };
}

export async function listPatientAppointmentsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { status, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = { patient: patientId };
    if (status) {
      const validStatuses = ["scheduled", "pending", "confirmed", "checked_in", "completed", "cancelled", "no_show"];
      const statusArr = status.split(",").filter((s) => validStatuses.includes(s));
      if (statusArr.length) query.status = { $in: statusArr };
    }

    const [appointments, total] = await Promise.all([
      Appointment.find(query)
        .populate("doctor", "name email phone")
        .sort({ scheduledAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Appointment.countDocuments(query)
    ]);

    return res.json({
      appointments: appointments.map(buildAppointmentResponse).filter(Boolean),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    console.error("listPatientAppointmentsController error:", err);
    return res.status(500).json({ error: "Failed to load appointments" });
  }
}

export async function requestAppointmentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { reason, preferredDate, appointmentType } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Reason is required" });
    }

    const profile = await PatientProfile.findOne({ user: patientId }).lean();
    if (!profile) return res.status(404).json({ error: "Patient profile not found" });

    const assignedNurse = profile.assignedNurses?.[0] || null;
    const assignedDoctor = profile.assignedDoctors?.[0] || null;

    const task = await CrmTask.create({
      patient: patientId,
      assignedNurse: assignedNurse,
      assignedDoctor: assignedDoctor,
      title: `Appointment Request from Patient`,
      description: `Patient requested an appointment.\nReason: ${reason.trim()}${preferredDate ? `\nPreferred Date: ${preferredDate}` : ""}${appointmentType ? `\nType: ${appointmentType}` : ""}`,
      category: "call",
      status: "pending",
      priority: "medium",
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    if (assignedNurse) {
      await Notification.create({
        user: assignedNurse,
        type: "appointment_request",
        title: "New Appointment Request",
        message: `Patient ${req.user.name || ""} has requested an appointment. Reason: ${reason.trim()}`,
        metadata: { patientId, taskId: task._id.toString() },
        createdBy: patientId
      });

      // Send email notification to nurse
      try {
        const nurseUser = await User.findById(assignedNurse, "email name").lean();
        if (nurseUser?.email) {
          await sendPlainNotificationEmail({
            toEmail: nurseUser.email,
            subject: "New Appointment Request from Patient",
            body: `Hello ${nurseUser.name || "Nurse"},\n\nPatient "${req.user.name || "Unknown"}" has requested a new appointment.\n\nReason: ${reason.trim()}${preferredDate ? `\nPreferred Date: ${preferredDate}` : ""}${appointmentType ? `\nType: ${appointmentType}` : ""}\n\nPlease log in to the nurse panel to review and schedule this appointment.`
          });
        }
      } catch (emailErr) {
        console.warn("Failed to send appointment request email:", emailErr?.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: "Appointment request sent to your care team. They will contact you shortly."
    });
  } catch (err) {
    console.error("requestAppointmentController error:", err);
    return res.status(500).json({ error: "Failed to send appointment request" });
  }
}

export async function requestRescheduleController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const { reason, preferredDate } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Reason for rescheduling is required" });
    }

    const appointment = await Appointment.findOne({ _id: id, patient: patientId }).lean();
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });

    if (!["scheduled", "confirmed"].includes(appointment.status)) {
      return res.status(400).json({ error: "Only scheduled or confirmed appointments can be rescheduled" });
    }

    const profile = await PatientProfile.findOne({ user: patientId }).lean();
    const assignedNurse = profile?.assignedNurses?.[0] || null;

    await CrmTask.create({
      patient: patientId,
      assignedNurse: assignedNurse,
      assignedDoctor: appointment.doctor,
      title: `Reschedule Request from Patient`,
      description: `Patient requested to reschedule appointment on ${new Date(appointment.scheduledAt).toLocaleDateString()}.\nReason: ${reason.trim()}${preferredDate ? `\nPreferred new date: ${preferredDate}` : ""}`,
      category: "call",
      status: "pending",
      priority: "high",
      dueAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });

    if (assignedNurse) {
      await Notification.create({
        user: assignedNurse,
        type: "reschedule_request",
        title: "Reschedule Request",
        message: `Patient ${req.user.name || ""} wants to reschedule appointment on ${new Date(appointment.scheduledAt).toLocaleDateString()}. Reason: ${reason.trim()}`,
        metadata: { patientId, appointmentId: id },
        createdBy: patientId
      });
    }

    return res.json({
      success: true,
      message: "Reschedule request sent. Your care team will contact you with new options."
    });
  } catch (err) {
    console.error("requestRescheduleController error:", err);
    return res.status(500).json({ error: "Failed to send reschedule request" });
  }
}

export async function cancelAppointmentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Cancellation reason is required" });
    }

    const appointment = await Appointment.findOne({ _id: id, patient: patientId });
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });

    if (!["scheduled", "confirmed"].includes(appointment.status)) {
      return res.status(400).json({ error: "Only scheduled or confirmed appointments can be cancelled" });
    }

    const hoursUntil = (new Date(appointment.scheduledAt) - new Date()) / (1000 * 60 * 60);
    if (hoursUntil < 24) {
      return res.status(400).json({ error: "Cannot cancel an appointment less than 24 hours before the scheduled time. Please contact your care team directly." });
    }

    appointment.status = "cancelled";
    appointment.cancelledAt = new Date();
    appointment.notes.push({
      type: "status",
      channel: "system",
      message: `Cancelled by patient. Reason: ${reason.trim()}`,
      createdBy: patientId
    });
    await appointment.save();

    const profile = await PatientProfile.findOne({ user: patientId }).lean();
    const assignedNurse = profile?.assignedNurses?.[0] || null;

    if (assignedNurse) {
      await Notification.create({
        user: assignedNurse,
        type: "appointment_cancelled",
        title: "Appointment Cancelled by Patient",
        message: `Patient ${req.user.name || ""} cancelled appointment on ${new Date(appointment.scheduledAt).toLocaleDateString()}. Reason: ${reason.trim()}`,
        metadata: { patientId, appointmentId: id },
        createdBy: patientId
      });
    }

    return res.json({
      success: true,
      message: "Appointment cancelled successfully."
    });
  } catch (err) {
    console.error("cancelAppointmentController error:", err);
    return res.status(500).json({ error: "Failed to cancel appointment" });
  }
}
