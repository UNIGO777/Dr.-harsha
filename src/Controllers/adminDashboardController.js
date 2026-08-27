import { User } from "../Models/User.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { Appointment } from "../Models/Appointment.js";
import { CrmTask } from "../Models/CrmTask.js";
import { Lead } from "../Models/Lead.js";
import { Recommendation } from "../Models/Recommendation.js";
import { Payment } from "../Models/Payment.js";
import { Enrollment } from "../Models/Enrollment.js";
import { ReferralRequest } from "../Models/ReferralRequest.js";
import { GoogleReview } from "../Models/GoogleReview.js";
import { BackupRun } from "../Models/BackupRun.js";
import { LEAD_UNCONTACTED_ALERT_HOURS } from "./leadController.js";

/**
 * "This month" tiles + red alerts for the admin dashboard.
 * Kept in one function so the payload is assembled with a single Promise.all.
 */
async function buildThisMonthAndAlerts(now) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const uncontactedCutoff = new Date(now.getTime() - LEAD_UNCONTACTED_ALERT_HOURS * 60 * 60 * 1000);

  const [
    leadsReceived,
    leadsContacted,
    appointmentsBooked,
    appointmentsAttended,
    lyfRecommended,
    lyfBooked,
    monthPayments,
    programmeEnrolments,
    followUpsOverdue,
    renewalsDueThisWeek,
    googleReviews,
    referralsGenerated,
    uncontactedLeads,
    latestBackup,
    recentCompletedPatients,
    lyfDiscussedPatients,
    activeEnrollmentPatients
  ] = await Promise.all([
    Lead.countDocuments({ createdAt: { $gte: monthStart } }),
    Lead.countDocuments({ firstContactedAt: { $gte: monthStart } }),
    Appointment.countDocuments({ createdAt: { $gte: monthStart } }),
    Appointment.countDocuments({ status: "completed", scheduledAt: { $gte: monthStart } }),
    Recommendation.countDocuments({ category: "lyfinfinity", recommendedAt: { $gte: monthStart } }),
    Recommendation.countDocuments({ category: "lyfinfinity", bookedAt: { $gte: monthStart } }),
    Payment.aggregate([
      { $match: { paidAt: { $gte: monthStart } } },
      { $unwind: "$allocations" },
      { $group: { _id: "$allocations.category", total: { $sum: "$allocations.amount" } } }
    ]),
    Enrollment.countDocuments({ category: { $in: ["programme", "lyfinfinity", "diet"] }, createdAt: { $gte: monthStart } }),
    PatientProfile.countDocuments({ followUpDueAt: { $ne: null, $lt: now } }),
    Enrollment.countDocuments({ status: "active", renewalDueAt: { $ne: null, $gte: now, $lte: weekAhead } }),
    GoogleReview.countDocuments({ reviewedAt: { $gte: monthStart } }),
    ReferralRequest.countDocuments({ status: { $in: ["referred", "converted"] }, referredAt: { $gte: monthStart } }),
    Lead.countDocuments({ stage: "new", createdAt: { $lt: uncontactedCutoff } }),
    BackupRun.findOne({}).sort({ startedAt: -1 }).lean(),
    Appointment.distinct("patient", { status: "completed", scheduledAt: { $gte: thirtyDaysAgo } }),
    Recommendation.distinct("patient", { category: "lyfinfinity" }),
    Enrollment.distinct("patient", { status: "active" })
  ]);

  const totalRevenue = Math.round(monthPayments.reduce((sum, row) => sum + row.total, 0) * 100) / 100;
  const lyfRevenue =
    Math.round((monthPayments.find((row) => row._id === "lyfinfinity")?.total || 0) * 100) / 100;

  // "Eligible patients left without a LyfInfinity discussion":
  // completed a visit in the last 30 days, never had a LyfInfinity recommendation
  const lyfDiscussedSet = new Set(lyfDiscussedPatients.map((id) => id.toString()));
  const missedLyfDiscussion = recentCompletedPatients.filter((id) => !lyfDiscussedSet.has(id.toString())).length;

  // "Programme patients missed follow-up": active enrollment + overdue follow-up
  const programmeMissedFollowUp = activeEnrollmentPatients.length
    ? await PatientProfile.countDocuments({
        user: { $in: activeEnrollmentPatients },
        followUpDueAt: { $ne: null, $lt: now }
      })
    : 0;

  const alerts = [];
  if (uncontactedLeads > 0) {
    alerts.push({
      severity: "red",
      key: "uncontacted_leads",
      count: uncontactedLeads,
      message: `${uncontactedLeads} lead${uncontactedLeads === 1 ? " has" : "s have"} not been called.`
    });
  }
  if (missedLyfDiscussion > 0) {
    alerts.push({
      severity: "red",
      key: "missed_lyf_discussion",
      count: missedLyfDiscussion,
      message: `${missedLyfDiscussion} eligible patient${missedLyfDiscussion === 1 ? "" : "s"} left without a LyfInfinity discussion.`
    });
  }
  if (programmeMissedFollowUp > 0) {
    alerts.push({
      severity: "red",
      key: "programme_missed_followup",
      count: programmeMissedFollowUp,
      message: `${programmeMissedFollowUp} programme patient${programmeMissedFollowUp === 1 ? "" : "s"} missed follow-up.`
    });
  }
  if (renewalsDueThisWeek > 0) {
    alerts.push({
      severity: "red",
      key: "renewals_due",
      count: renewalsDueThisWeek,
      message: `${renewalsDueThisWeek} renewal${renewalsDueThisWeek === 1 ? " is" : "s are"} due this week.`
    });
  }
  if (!latestBackup) {
    alerts.push({
      severity: "amber",
      key: "backup_not_configured",
      count: 0,
      message: "Automated database backups are not configured yet."
    });
  } else if (latestBackup.status === "failed") {
    alerts.push({
      severity: "red",
      key: "backup_failed",
      count: 1,
      message: "Database backup failed on its last run."
    });
  } else if (new Date(latestBackup.startedAt).getTime() < now.getTime() - 26 * 60 * 60 * 1000) {
    alerts.push({
      severity: "red",
      key: "backup_stale",
      count: 1,
      message: "No successful database backup in the last 24 hours."
    });
  }

  return {
    thisMonth: {
      leadsReceived,
      leadsContacted,
      appointmentsBooked,
      appointmentsAttended,
      lyfRecommended,
      lyfBooked,
      lyfRevenue,
      programmeEnrolments,
      totalRevenue,
      followUpsOverdue,
      renewalsDueThisWeek,
      googleReviews,
      referralsGenerated
    },
    alerts
  };
}

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

    const { thisMonth, alerts } = await buildThisMonthAndAlerts(now);

    return res.json({
      thisMonth,
      alerts,
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
