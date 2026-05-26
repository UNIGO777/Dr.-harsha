import { DoctorAssignment } from "../Models/DoctorAssignment.js";
import { User } from "../Models/User.js";
import { sendAssignmentEmail } from "../utils/emailService.js";

export async function createDoctorAssignmentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database is not ready" });
    }

    const doctorId = req.user._id;
    const { title, description, assignedTo, priority, dueAt, notes } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }
    if (!assignedTo) {
      return res.status(400).json({ error: "Assigned user is required" });
    }

    const recipient = await User.findById(assignedTo).lean();
    if (!recipient) {
      return res.status(404).json({ error: "Assigned user not found" });
    }
    if (recipient.status === "blocked") {
      return res.status(400).json({ error: "Cannot assign to a blocked user" });
    }

    const assignment = await DoctorAssignment.create({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
      assignedTo,
      createdBy: doctorId,
      priority: priority || "medium",
      dueAt: dueAt || null,
      notes: typeof notes === "string" ? notes.trim() : "",
    });

    // Send email notification
    let emailSent = false;
    try {
      await sendAssignmentEmail({
        toEmail: recipient.email,
        recipientName: recipient.name,
        doctorName: req.user.name,
        title: assignment.title,
        description: assignment.description,
        priority: assignment.priority,
        dueAt: assignment.dueAt,
      });
      assignment.emailSentAt = new Date();
      await assignment.save();
      emailSent = true;
    } catch (emailErr) {
      console.error("Failed to send assignment email:", emailErr?.message || emailErr);
    }

    const populated = await DoctorAssignment.findById(assignment._id)
      .populate("assignedTo", "name email role userNumber")
      .lean();

    return res.status(201).json({
      message: emailSent
        ? "Assignment created and email sent successfully"
        : "Assignment created but email could not be sent",
      assignment: buildAssignmentResponse(populated),
      emailSent,
    });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Failed to create assignment";
    return res.status(statusCode).json({ error: message });
  }
}

export async function listDoctorAssignmentsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database is not ready" });
    }

    const doctorId = req.user._id;
    const { status, priority, search } = req.query;

    const filter = { createdBy: doctorId };
    if (status && status !== "all") filter.status = status;
    if (priority && priority !== "all") filter.priority = priority;

    if (search && typeof search === "string" && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [{ title: searchRegex }, { description: searchRegex }];
    }

    const assignments = await DoctorAssignment.find(filter)
      .populate("assignedTo", "name email role userNumber")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({
      assignments: assignments.map(buildAssignmentResponse),
      total: assignments.length,
    });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Failed to list assignments";
    return res.status(statusCode).json({ error: message });
  }
}

export async function updateDoctorAssignmentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database is not ready" });
    }

    const doctorId = req.user._id;
    const { assignmentId } = req.params;
    const { status, notes } = req.body;

    const assignment = await DoctorAssignment.findOne({ _id: assignmentId, createdBy: doctorId });
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    if (status) {
      const validStatuses = ["pending", "in_progress", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      assignment.status = status;
      if (status === "completed") assignment.completedAt = new Date();
      if (status === "cancelled") assignment.cancelledAt = new Date();
    }

    if (typeof notes === "string") {
      assignment.notes = notes.trim();
    }

    await assignment.save();

    const populated = await DoctorAssignment.findById(assignment._id)
      .populate("assignedTo", "name email role userNumber")
      .lean();

    return res.status(200).json({
      message: "Assignment updated successfully",
      assignment: buildAssignmentResponse(populated),
    });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Failed to update assignment";
    return res.status(statusCode).json({ error: message });
  }
}

function buildAssignmentResponse(doc) {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    priority: doc.priority,
    status: doc.status,
    dueAt: doc.dueAt,
    notes: doc.notes,
    emailSentAt: doc.emailSentAt,
    completedAt: doc.completedAt,
    cancelledAt: doc.cancelledAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    assignedTo: doc.assignedTo
      ? {
          id: doc.assignedTo._id,
          name: doc.assignedTo.name,
          email: doc.assignedTo.email,
          role: doc.assignedTo.role,
          userNumber: doc.assignedTo.userNumber,
        }
      : null,
  };
}
