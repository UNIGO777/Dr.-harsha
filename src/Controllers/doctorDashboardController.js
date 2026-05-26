import { Appointment } from "../Models/Appointment.js";
import { PatientProfile } from "../Models/PatientProfile.js";

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

export async function getDoctorDashboardController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const doctorId = req?.user?._id?.toString?.() || "";
    if (!doctorId) return res.status(401).json({ error: "Unauthorized" });

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const endOfWeek = new Date(startOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Patients scoped to this doctor
    const patientProfiles = await PatientProfile.find({ assignedDoctors: doctorId })
      .populate("user", "name email phone status userNumber")
      .lean();

    const patientIds = patientProfiles
      .map((p) => p?.user?._id?.toString?.() || "")
      .filter(Boolean);

    // ── Queue 1: Today's appointments ────────────────────────────────────────
    const todayApptQuery = {
      doctor: doctorId,
      patient: { $in: patientIds },
      scheduledAt: { $gte: startOfToday, $lte: endOfToday }
    };

    const [todayApptItems, todayApptCount] = await Promise.all([
      Appointment.find(todayApptQuery)
        .populate("patient", "name email phone status userNumber")
        .sort({ scheduledAt: 1 })
        .limit(6)
        .lean(),
      Appointment.countDocuments(todayApptQuery)
    ]);

    // ── Queue 2: Upcoming this week (excluding today) ─────────────────────────
    const upcomingApptQuery = {
      doctor: doctorId,
      patient: { $in: patientIds },
      scheduledAt: { $gt: endOfToday, $lte: endOfWeek },
      status: { $nin: ["cancelled", "no_show"] }
    };

    const [upcomingApptItems, upcomingApptCount] = await Promise.all([
      Appointment.find(upcomingApptQuery)
        .populate("patient", "name email phone status userNumber")
        .sort({ scheduledAt: 1 })
        .limit(6)
        .lean(),
      Appointment.countDocuments(upcomingApptQuery)
    ]);

    // ── Queue 3: Missed appointments (no_show, last 30 days) ─────────────────
    const missedQuery = {
      doctor: doctorId,
      patient: { $in: patientIds },
      status: "no_show",
      scheduledAt: { $gte: thirtyDaysAgo }
    };

    const [missedItems, missedCount] = await Promise.all([
      Appointment.find(missedQuery)
        .populate("patient", "name email phone status userNumber")
        .sort({ scheduledAt: -1 })
        .limit(6)
        .lean(),
      Appointment.countDocuments(missedQuery)
    ]);

    // ── Analytics ─────────────────────────────────────────────────────────────

    // Patient priority breakdown
    const priorityCounts = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const profile of patientProfiles) {
      const p = profile.priority || "medium";
      if (p in priorityCounts) priorityCounts[p]++;
    }

    // Patient status breakdown
    const statusCounts = { active: 0, blocked: 0, inactive: 0 };
    for (const profile of patientProfiles) {
      const s = profile.user?.status || "inactive";
      if (s === "active") statusCounts.active++;
      else if (s === "blocked") statusCounts.blocked++;
      else statusCounts.inactive++;
    }

    // Appointment outcomes — last 30 days
    const recentAppointments = await Appointment.find({
      doctor: doctorId,
      patient: { $in: patientIds },
      scheduledAt: { $gte: thirtyDaysAgo, $lte: now }
    })
      .select("status appointmentType scheduledAt")
      .lean();

    const apptStatusCounts = {
      completed: 0,
      confirmed: 0,
      pending: 0,
      cancelled: 0,
      no_show: 0,
      checked_in: 0,
      scheduled: 0
    };
    for (const a of recentAppointments) {
      const s = a.status || "pending";
      if (s in apptStatusCounts) apptStatusCounts[s]++;
    }

    // Appointment type breakdown — last 30 days
    const apptTypeCounts = {
      in_person: 0,
      walk_in: 0,
      follow_up: 0,
      online_consultation: 0
    };
    for (const a of recentAppointments) {
      const t = a.appointmentType || "in_person";
      if (t in apptTypeCounts) apptTypeCounts[t]++;
    }

    // Summary stats
    const upcomingWeekCount = await Appointment.countDocuments({
      doctor: doctorId,
      patient: { $in: patientIds },
      scheduledAt: { $gte: startOfToday, $lte: endOfWeek },
      status: { $nin: ["cancelled", "no_show"] }
    });

    return res.json({
      queues: {
        todayAppointments: {
          count: todayApptCount,
          items: todayApptItems.map((a) => ({
            id: a._id.toString(),
            scheduledAt: a.scheduledAt,
            endsAt: a.endsAt || null,
            status: a.status,
            reason: a.reason || "",
            appointmentType: a.appointmentType || "in_person",
            patient: buildUserOption(a.patient)
          }))
        },
        upcomingAppointments: {
          count: upcomingApptCount,
          items: upcomingApptItems.map((a) => ({
            id: a._id.toString(),
            scheduledAt: a.scheduledAt,
            endsAt: a.endsAt || null,
            status: a.status,
            reason: a.reason || "",
            appointmentType: a.appointmentType || "in_person",
            patient: buildUserOption(a.patient)
          }))
        },
        missedAppointments: {
          count: missedCount,
          items: missedItems.map((a) => ({
            id: a._id.toString(),
            scheduledAt: a.scheduledAt,
            reason: a.reason || "",
            appointmentType: a.appointmentType || "in_person",
            patient: buildUserOption(a.patient)
          }))
        }
      },
      analytics: {
        patientPriority: priorityCounts,
        patientStatus: statusCounts,
        appointmentOutcomes: apptStatusCounts,
        appointmentTypes: apptTypeCounts,
        periodDays: 30
      },
      summary: {
        totalPatients: patientIds.length,
        todayAppointments: todayApptCount,
        upcomingThisWeek: upcomingWeekCount,
        completedLast30Days: apptStatusCounts.completed
      }
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to load doctor dashboard";
    return res.status(statusCode).json({ error: message });
  }
}
