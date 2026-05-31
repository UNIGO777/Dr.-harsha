import { PatientProfile } from "../Models/PatientProfile.js";
import { Appointment } from "../Models/Appointment.js";
import { PatientReport } from "../Models/PatientReport.js";
import { Notification } from "../Models/Notification.js";

function buildDoctorOption(user) {
  if (!user?._id) return null;
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || ""
  };
}

export async function getPatientDashboardController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const now = new Date();

    const [profile, nextAppointment, latestReport, unreadCount, recentAppointments] = await Promise.all([
      PatientProfile.findOne({ user: patientId })
        .populate("assignedDoctors", "name email phone userNumber")
        .populate("assignedNurses", "name email phone userNumber")
        .lean(),

      Appointment.findOne({
        patient: patientId,
        status: { $in: ["scheduled", "confirmed"] },
        scheduledAt: { $gte: now }
      })
        .populate("doctor", "name email phone")
        .sort({ scheduledAt: 1 })
        .lean(),

      PatientReport.findOne({ patient: patientId })
        .select("reportNumber createdAt assignedDoctor")
        .populate("assignedDoctor", "name")
        .sort({ createdAt: -1 })
        .lean(),

      Notification.countDocuments({ user: patientId, isRead: false }),

      Appointment.find({ patient: patientId })
        .populate("doctor", "name")
        .sort({ scheduledAt: -1 })
        .limit(5)
        .lean()
    ]);

    const medicationsCount = profile?.medications?.length || 0;
    const assignedDoctors = (profile?.assignedDoctors || []).map(buildDoctorOption).filter(Boolean);
    const assignedNurses = (profile?.assignedNurses || []).map(buildDoctorOption).filter(Boolean);

    const recentActivity = recentAppointments.map((apt) => ({
      id: apt._id.toString(),
      type: "appointment",
      title: `${apt.status === "completed" ? "Completed" : apt.status === "cancelled" ? "Cancelled" : "Scheduled"} appointment`,
      description: `With Dr. ${apt.doctor?.name || "Unknown"}`,
      date: apt.scheduledAt,
      status: apt.status
    }));

    return res.json({
      stats: {
        medicationsCount,
        unreadNotifications: unreadCount,
        nextAppointmentAt: nextAppointment?.scheduledAt || null,
        latestReportAt: latestReport?.createdAt || null
      },
      nextAppointment: nextAppointment
        ? {
            id: nextAppointment._id.toString(),
            scheduledAt: nextAppointment.scheduledAt,
            endsAt: nextAppointment.endsAt,
            doctor: buildDoctorOption(nextAppointment.doctor),
            appointmentType: nextAppointment.appointmentType,
            reason: nextAppointment.reason,
            status: nextAppointment.status,
            preparationInstructions: nextAppointment.preparationInstructions || ""
          }
        : null,
      latestReport: latestReport
        ? {
            id: latestReport._id.toString(),
            reportNumber: latestReport.reportNumber,
            createdAt: latestReport.createdAt,
            doctor: latestReport.assignedDoctor?.name || ""
          }
        : null,
      careTeam: { doctors: assignedDoctors, nurses: assignedNurses },
      recentActivity
    });
  } catch (err) {
    console.error("getPatientDashboardController error:", err);
    return res.status(500).json({ error: "Failed to load dashboard" });
  }
}
