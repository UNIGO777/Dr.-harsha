import { PatientFeedback } from "../Models/PatientFeedback.js";
import { Appointment } from "../Models/Appointment.js";

/**
 * GET /api/patient/feedback
 * List past feedback submitted by patient
 */
export async function listFeedbackController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const feedback = await PatientFeedback.find({ patient: patientId })
      .populate("appointment", "scheduledAt appointmentType")
      .sort({ createdAt: -1 })
      .lean();

    const items = feedback.map((f) => ({
      id: f._id,
      appointment: f.appointment
        ? { id: f.appointment._id, date: f.appointment.scheduledAt, type: f.appointment.appointmentType }
        : null,
      ratings: f.ratings,
      comment: f.comment,
      anonymous: f.anonymous,
      createdAt: f.createdAt,
    }));

    return res.json({ feedback: items });
  } catch (err) {
    console.error("listFeedback error:", err);
    return res.status(500).json({ message: "Failed to fetch feedback" });
  }
}

/**
 * POST /api/patient/feedback
 * Submit feedback for an appointment
 */
export async function submitFeedbackController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });
    const { appointmentId, ratings, comment, anonymous } = req.body;

    if (!ratings?.overall || ratings.overall < 1 || ratings.overall > 5) {
      return res.status(400).json({ message: "Overall rating (1-5) is required" });
    }

    // Check if feedback already exists for this appointment
    if (appointmentId) {
      const existing = await PatientFeedback.findOne({ appointment: appointmentId }).lean();
      if (existing) {
        return res.status(400).json({ message: "Feedback already submitted for this appointment" });
      }

      // Verify the appointment belongs to this patient
      const apt = await Appointment.findOne({ _id: appointmentId, patient: patientId }).lean();
      if (!apt) {
        return res.status(404).json({ message: "Appointment not found" });
      }
    }

    const feedback = await PatientFeedback.create({
      patient: patientId,
      appointment: appointmentId || null,
      ratings: {
        overall: ratings.overall,
        doctorCommunication: ratings.doctorCommunication || null,
        waitTime: ratings.waitTime || null,
        staffBehavior: ratings.staffBehavior || null,
      },
      comment: comment?.trim() || "",
      anonymous: !!anonymous,
    });

    return res.status(201).json({
      feedback: {
        id: feedback._id,
        ratings: feedback.ratings,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
      },
    });
  } catch (err) {
    console.error("submitFeedback error:", err);
    return res.status(500).json({ message: "Failed to submit feedback" });
  }
}

/**
 * GET /api/patient/feedback/pending
 * Appointments completed in last 30 days without feedback
 */
export async function getPendingFeedbackController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const completedApts = await Appointment.find({
      patient: patientId,
      status: "completed",
      scheduledAt: { $gte: thirtyDaysAgo },
    })
      .populate("doctor", "name")
      .sort({ scheduledAt: -1 })
      .lean();

    if (completedApts.length === 0) {
      return res.json({ pending: [] });
    }

    const aptIds = completedApts.map((a) => a._id);
    const existingFeedback = await PatientFeedback.find({
      appointment: { $in: aptIds },
    }).lean();

    const feedbackAptIds = new Set(existingFeedback.map((f) => f.appointment?.toString()));

    const pending = completedApts
      .filter((a) => !feedbackAptIds.has(a._id.toString()))
      .map((a) => ({
        id: a._id,
        date: a.scheduledAt,
        type: a.appointmentType,
        doctorName: a.doctor?.name || "Unknown",
      }));

    return res.json({ pending });
  } catch (err) {
    console.error("getPendingFeedback error:", err);
    return res.status(500).json({ message: "Failed to fetch pending feedback" });
  }
}
