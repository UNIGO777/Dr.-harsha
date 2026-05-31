import { CrmTask } from "../Models/CrmTask.js";
import { User } from "../Models/User.js";

/**
 * GET /api/nurse/requested-appointments
 * List appointment requests from patients (CRM tasks with appointment_request type)
 */
export async function listRequestedAppointmentsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const { status = "all", page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {
      assignedNurse: nurseId,
      title: { $regex: /Appointment Request/i },
    };

    if (status && status !== "all") {
      query.status = status;
    }

    const [tasks, total] = await Promise.all([
      CrmTask.find(query)
        .populate("patient", "name email phone")
        .populate("assignedDoctor", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      CrmTask.countDocuments(query),
    ]);

    const requests = tasks.map((t) => ({
      id: t._id.toString(),
      patient: t.patient ? { id: t.patient._id.toString(), name: t.patient.name, email: t.patient.email, phone: t.patient.phone } : null,
      doctor: t.assignedDoctor ? { id: t.assignedDoctor._id.toString(), name: t.assignedDoctor.name } : null,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueAt: t.dueAt,
      createdAt: t.createdAt,
    }));

    return res.json({ requests, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    console.error("listRequestedAppointments error:", err);
    return res.status(500).json({ error: "Failed to fetch requested appointments" });
  }
}

/**
 * PATCH /api/nurse/requested-appointments/:id/status
 * Update status of an appointment request (e.g. mark as completed after scheduling)
 */
export async function updateRequestedAppointmentStatusController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const { status, note } = req.body;

    if (!["pending", "in_progress", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const task = await CrmTask.findOne({ _id: id, assignedNurse: nurseId });
    if (!task) return res.status(404).json({ error: "Request not found" });

    task.status = status;
    if (note) {
      if (!task.notes) task.notes = [];
      task.notes.push({ message: note, createdBy: nurseId, createdAt: new Date() });
    }
    if (status === "completed") task.completedAt = new Date();
    await task.save();

    return res.json({ success: true, status });
  } catch (err) {
    console.error("updateRequestedAppointmentStatus error:", err);
    return res.status(500).json({ error: "Failed to update status" });
  }
}
