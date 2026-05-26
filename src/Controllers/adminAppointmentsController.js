import { Appointment, APPOINTMENT_STATUS_ENUM } from "../Models/Appointment.js";

function buildUserOption(user) {
  if (!user?._id) return null;
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    status: user.status,
    userNumber: user.userNumber ?? null
  };
}

export async function listAdminAppointmentsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const userId = req?.user?._id?.toString?.() || "";
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const {
      doctorId,
      status,
      appointmentType,
      dateFrom,
      dateTo,
      page: rawPage,
      limit: rawLimit
    } = req.query;

    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (doctorId) filter.doctor = doctorId;
    if (status) filter.status = status;
    if (appointmentType) filter.appointmentType = appointmentType;

    if (dateFrom || dateTo) {
      filter.scheduledAt = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (!Number.isNaN(from.getTime())) filter.scheduledAt.$gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (!Number.isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          filter.scheduledAt.$lte = to;
        }
      }
      if (Object.keys(filter.scheduledAt).length === 0) delete filter.scheduledAt;
    }

    const [items, total] = await Promise.all([
      Appointment.find(filter)
        .populate("patient", "name email phone status userNumber")
        .populate("doctor", "name email phone status userNumber")
        .populate("scheduledBy", "name email")
        .sort({ scheduledAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Appointment.countDocuments(filter)
    ]);

    return res.json({
      items: items.map((a) => ({
        id: a._id.toString(),
        scheduledAt: a.scheduledAt,
        endsAt: a.endsAt || null,
        slotMinutes: a.slotMinutes,
        status: a.status,
        reason: a.reason || "",
        outcome: a.outcome || "",
        appointmentType: a.appointmentType || "in_person",
        preparationInstructions: a.preparationInstructions || "",
        notes: (a.notes || []).map((n) => ({
          id: n._id?.toString?.() || "",
          type: n.type,
          channel: n.channel,
          message: n.message,
          createdAt: n.createdAt
        })),
        patient: buildUserOption(a.patient),
        doctor: buildUserOption(a.doctor),
        scheduledBy: a.scheduledBy ? { id: a.scheduledBy._id.toString(), name: a.scheduledBy.name, email: a.scheduledBy.email } : null,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to load appointments";
    return res.status(statusCode).json({ error: message });
  }
}

export async function updateAdminAppointmentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const userId = req?.user?._id?.toString?.() || "";
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const appointmentId = req.params?.appointmentId;
    if (!appointmentId) return res.status(400).json({ error: "Missing appointmentId" });

    const { status } = req.body || {};
    if (!status || !APPOINTMENT_STATUS_ENUM.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${APPOINTMENT_STATUS_ENUM.join(", ")}` });
    }

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });

    const now = new Date();
    appointment.status = status;

    if (status === "cancelled" && !appointment.cancelledAt) appointment.cancelledAt = now;
    if (status === "no_show" && !appointment.noShowAt) appointment.noShowAt = now;
    if (status === "completed" && !appointment.completedAt) appointment.completedAt = now;
    if (status === "checked_in" && !appointment.checkedInAt) appointment.checkedInAt = now;

    await appointment.save();

    return res.json({
      success: true,
      message: `Appointment status updated to ${status}`,
      appointment: {
        id: appointment._id.toString(),
        status: appointment.status,
        scheduledAt: appointment.scheduledAt,
        updatedAt: appointment.updatedAt
      }
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to update appointment";
    return res.status(statusCode).json({ error: message });
  }
}
