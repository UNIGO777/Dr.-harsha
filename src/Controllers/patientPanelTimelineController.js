import { Appointment } from "../Models/Appointment.js";
import { PatientReport } from "../Models/PatientReport.js";
import { PatientDocument } from "../Models/PatientDocument.js";
import { Notification } from "../Models/Notification.js";

export async function getPatientTimelineController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { type, startDate, endDate, page = 1, limit = 30 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 30));

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const events = [];

    // Fetch appointments
    if (!type || type === "appointment") {
      const aptQuery = { patient: patientId };
      if (dateFilter.$gte || dateFilter.$lte) aptQuery.scheduledAt = dateFilter;

      const appointments = await Appointment.find(aptQuery)
        .populate("doctor", "name")
        .sort({ scheduledAt: -1 })
        .limit(100)
        .lean();

      for (const apt of appointments) {
        events.push({
          id: `apt_${apt._id}`,
          type: "appointment",
          title: `Appointment ${apt.status === "completed" ? "completed" : apt.status === "cancelled" ? "cancelled" : "scheduled"}`,
          description: `With Dr. ${apt.doctor?.name || "Unknown"} - ${(apt.appointmentType || "").replace(/_/g, " ")}`,
          date: apt.scheduledAt,
          status: apt.status,
          metadata: { appointmentId: apt._id.toString(), reason: apt.reason }
        });
      }
    }

    // Fetch reports
    if (!type || type === "report") {
      const reportQuery = { patient: patientId };
      if (dateFilter.$gte || dateFilter.$lte) reportQuery.createdAt = dateFilter;

      const reports = await PatientReport.find(reportQuery)
        .select("reportNumber createdAt assignedDoctor")
        .populate("assignedDoctor", "name")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      for (const report of reports) {
        events.push({
          id: `rep_${report._id}`,
          type: "report",
          title: `Health Report #${report.reportNumber || "—"} generated`,
          description: `By Dr. ${report.assignedDoctor?.name || "Unknown"}`,
          date: report.createdAt,
          status: "completed",
          metadata: { reportId: report._id.toString() }
        });
      }
    }

    // Fetch documents
    if (!type || type === "document") {
      const docQuery = { patient: patientId };
      if (dateFilter.$gte || dateFilter.$lte) docQuery.createdAt = dateFilter;

      const documents = await PatientDocument.find(docQuery)
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      for (const doc of documents) {
        events.push({
          id: `doc_${doc._id}`,
          type: "document",
          title: `Document uploaded: ${doc.originalName}`,
          description: `Category: ${(doc.category || "").replace(/_/g, " ")} - ${doc.status === "reviewed" ? "Reviewed" : "Pending review"}`,
          date: doc.createdAt,
          status: doc.status === "reviewed" ? "completed" : "pending",
          metadata: { documentId: doc._id.toString(), category: doc.category }
        });
      }
    }

    // Fetch key notifications (medication changes, specialist referrals)
    if (!type || type === "notification") {
      const notifQuery = {
        user: patientId,
        type: { $in: ["medication_updated", "report_available", "appointment_scheduled", "appointment_rescheduled", "appointment_cancelled"] }
      };
      if (dateFilter.$gte || dateFilter.$lte) notifQuery.createdAt = dateFilter;

      const notifications = await Notification.find(notifQuery)
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();

      for (const notif of notifications) {
        events.push({
          id: `notif_${notif._id}`,
          type: "notification",
          title: notif.title,
          description: notif.message,
          date: notif.createdAt,
          status: "info",
          metadata: notif.metadata || null
        });
      }
    }

    // Sort all events by date descending
    events.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Paginate
    const total = events.length;
    const skip = (pageNum - 1) * limitNum;
    const paginatedEvents = events.slice(skip, skip + limitNum);

    return res.json({
      events: paginatedEvents,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    console.error("getPatientTimelineController error:", err);
    return res.status(500).json({ error: "Failed to load timeline" });
  }
}
