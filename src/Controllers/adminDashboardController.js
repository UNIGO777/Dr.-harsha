import { User } from "../Models/User.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { Appointment } from "../Models/Appointment.js";
import { CrmTask } from "../Models/CrmTask.js";

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

export async function getAdminDashboardController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const userId = req?.user?._id?.toString?.() || "";
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ── Summary counts ───────────────────────────────────────────────
    const [
      totalDoctors,
      totalNurses,
      totalPatients,
      activePatients,
      blockedPatients,
      totalAppointments,
      todayAppointmentCount,
      completedLast30,
      noShowLast30
    ] = await Promise.all([
      User.countDocuments({ role: "doctor", status: "active" }),
      User.countDocuments({ role: "nurse", status: "active" }),
      User.countDocuments({ role: "patient" }),
      User.countDocuments({ role: "patient", status: "active" }),
      User.countDocuments({ role: "patient", status: "blocked" }),
      Appointment.countDocuments({}),
      Appointment.countDocuments({ scheduledAt: { $gte: startOfToday, $lte: endOfToday } }),
      Appointment.countDocuments({ status: "completed", scheduledAt: { $gte: thirtyDaysAgo } }),
      Appointment.countDocuments({ status: "no_show", scheduledAt: { $gte: thirtyDaysAgo } })
    ]);

    // ── Queues ───────────────────────────────────────────────────────
    const [todayAppointmentItems, recentSignups] = await Promise.all([
      Appointment.find({ scheduledAt: { $gte: startOfToday, $lte: endOfToday } })
        .populate("patient", "name email phone status userNumber")
        .populate("doctor", "name email phone status userNumber")
        .sort({ scheduledAt: 1 })
        .limit(5)
        .lean(),
      User.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name email role status createdAt userNumber")
        .lean()
    ]);

    // ── Analytics ────────────────────────────────────────────────────

    // Patient priority breakdown
    const patientProfiles = await PatientProfile.find({}).select("priority").lean();
    const patientPriority = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const profile of patientProfiles) {
      const p = profile.priority || "medium";
      if (p in patientPriority) patientPriority[p]++;
    }

    // Appointment outcomes — last 30 days
    const recentAppointments = await Appointment.find({
      scheduledAt: { $gte: thirtyDaysAgo, $lte: now }
    })
      .select("status appointmentType")
      .lean();

    const appointmentOutcomes = {
      completed: 0, confirmed: 0, pending: 0, cancelled: 0,
      no_show: 0, checked_in: 0, scheduled: 0
    };
    const appointmentTypes = {
      in_person: 0, walk_in: 0, follow_up: 0, online_consultation: 0
    };

    for (const a of recentAppointments) {
      const s = a.status || "pending";
      if (s in appointmentOutcomes) appointmentOutcomes[s]++;
      const t = a.appointmentType || "in_person";
      if (t in appointmentTypes) appointmentTypes[t]++;
    }

    // CRM status breakdown
    const [crmPending, crmInProgress, crmCompleted, crmCancelled, crmOverdue] = await Promise.all([
      CrmTask.countDocuments({ status: "pending" }),
      CrmTask.countDocuments({ status: "in_progress" }),
      CrmTask.countDocuments({ status: "completed" }),
      CrmTask.countDocuments({ status: "cancelled" }),
      CrmTask.countDocuments({ status: { $in: ["pending", "in_progress"] }, dueAt: { $lt: now, $ne: null } })
    ]);

    return res.json({
      summary: {
        totalDoctors,
        totalNurses,
        totalPatients,
        activePatients,
        blockedPatients,
        totalAppointments,
        todayAppointments: todayAppointmentCount,
        completedLast30,
        noShowLast30
      },
      queues: {
        todayAppointments: {
          count: todayAppointmentCount,
          items: todayAppointmentItems.map((a) => ({
            id: a._id.toString(),
            scheduledAt: a.scheduledAt,
            endsAt: a.endsAt || null,
            status: a.status,
            reason: a.reason || "",
            appointmentType: a.appointmentType || "in_person",
            patient: buildUserOption(a.patient),
            doctor: buildUserOption(a.doctor)
          }))
        },
        recentSignups: {
          items: recentSignups.map((u) => ({
            id: u._id.toString(),
            name: u.name,
            email: u.email,
            role: u.role,
            status: u.status,
            createdAt: u.createdAt,
            userNumber: u.userNumber ?? null
          }))
        }
      },
      analytics: {
        patientPriority,
        appointmentOutcomes,
        appointmentTypes,
        crmStatus: {
          pending: crmPending,
          in_progress: crmInProgress,
          completed: crmCompleted,
          cancelled: crmCancelled,
          overdue: crmOverdue
        },
        periodDays: 30
      }
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to load admin dashboard";
    return res.status(statusCode).json({ error: message });
  }
}
