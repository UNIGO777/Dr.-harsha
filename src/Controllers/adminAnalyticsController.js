import { User } from "../Models/User.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { Appointment } from "../Models/Appointment.js";
import { CrmTask } from "../Models/CrmTask.js";
import { Lead, LEAD_STAGE_ENUM } from "../Models/Lead.js";
import { Recommendation, RECOMMENDATION_STAGE_ENUM } from "../Models/Recommendation.js";

/**
 * Growth analytics: lead sources, new vs returning, service funnel,
 * appointment funnel. Separate from the legacy blocks so the original
 * response shape stays untouched.
 */
async function buildGrowthAnalytics(now) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    patientSourcesRaw,
    legacyReferenceCount,
    repeatPatientRaw,
    monthAppointmentPatients,
    leadStageRaw,
    funnelAllTimeRaw,
    funnelLyfRaw,
    apptTotals
  ] = await Promise.all([
    // Where patients came from (intake form, multi-select)
    PatientProfile.aggregate([
      { $unwind: "$intake.discoverySources" },
      { $group: { _id: "$intake.discoverySources", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    // Patients created before the intake form existed, source only in free text
    PatientProfile.countDocuments({
      reference: { $nin: ["", null] },
      $or: [{ "intake.discoverySources": { $size: 0 } }, { "intake.discoverySources": { $exists: false } }]
    }),
    // Repeat patients: more than one completed appointment ever
    Appointment.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: "$patient", visits: { $sum: 1 } } },
      { $match: { visits: { $gt: 1 } } },
      { $count: "count" }
    ]),
    Appointment.distinct("patient", { scheduledAt: { $gte: monthStart } }),
    Lead.aggregate([{ $group: { _id: "$stage", count: { $sum: 1 } } }]),
    Recommendation.aggregate([
      {
        $group: {
          _id: null,
          recommended: { $sum: 1 },
          interested: { $sum: { $cond: [{ $ne: ["$interestedAt", null] }, 1, 0] } },
          booked: { $sum: { $cond: [{ $ne: ["$bookedAt", null] }, 1, 0] } },
          paid: { $sum: { $cond: [{ $ne: ["$paidAt", null] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $ne: ["$completedAt", null] }, 1, 0] } },
          declined: { $sum: { $cond: [{ $ne: ["$declinedAt", null] }, 1, 0] } },
          leakedValue: {
            $sum: { $cond: [{ $eq: ["$stage", "declined"] }, "$expectedValue", 0] }
          }
        }
      }
    ]),
    Recommendation.aggregate([
      { $match: { category: "lyfinfinity" } },
      {
        $group: {
          _id: null,
          recommended: { $sum: 1 },
          interested: { $sum: { $cond: [{ $ne: ["$interestedAt", null] }, 1, 0] } },
          booked: { $sum: { $cond: [{ $ne: ["$bookedAt", null] }, 1, 0] } },
          paid: { $sum: { $cond: [{ $ne: ["$paidAt", null] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $ne: ["$completedAt", null] }, 1, 0] } },
          declined: { $sum: { $cond: [{ $ne: ["$declinedAt", null] }, 1, 0] } }
        }
      }
    ]),
    Appointment.aggregate([
      { $match: { scheduledAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: null,
          booked: { $sum: 1 },
          attended: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          noShow: { $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] } },
          rescheduled: { $sum: { $cond: [{ $gt: ["$rescheduleCount", 0] }, 1, 0] } }
        }
      }
    ])
  ]);

  // New vs returning: had any appointment this month, split by account age
  let newPatients = 0;
  let returningPatients = 0;
  if (monthAppointmentPatients.length > 0) {
    newPatients = await User.countDocuments({
      _id: { $in: monthAppointmentPatients },
      createdAt: { $gte: monthStart }
    });
    returningPatients = monthAppointmentPatients.length - newPatients;
  }
  const monthPatientTotal = newPatients + returningPatients;

  const leadStages = Object.fromEntries(LEAD_STAGE_ENUM.map((stage) => [stage, 0]));
  for (const row of leadStageRaw) {
    if (row._id in leadStages) leadStages[row._id] = row.count;
  }

  const emptyFunnel = { recommended: 0, interested: 0, booked: 0, paid: 0, completed: 0, declined: 0 };
  const funnel = { ...emptyFunnel, leakedValue: 0, ...(funnelAllTimeRaw[0] || {}) };
  delete funnel._id;
  const lyfFunnel = { ...emptyFunnel, ...(funnelLyfRaw[0] || {}) };
  delete lyfFunnel._id;

  const appt = apptTotals[0] || { booked: 0, attended: 0, cancelled: 0, noShow: 0, rescheduled: 0 };
  const decided = appt.attended + appt.noShow;

  return {
    patientSources: [
      ...patientSourcesRaw.map((row) => ({ source: row._id, count: row.count })),
      ...(legacyReferenceCount > 0 ? [{ source: "legacy_reference", count: legacyReferenceCount }] : [])
    ],
    repeatPatients: repeatPatientRaw[0]?.count || 0,
    newVsReturning: {
      month: monthStart,
      newPatients,
      returningPatients,
      newPercent: monthPatientTotal > 0 ? Math.round((newPatients / monthPatientTotal) * 100) : 0,
      returningPercent: monthPatientTotal > 0 ? Math.round((returningPatients / monthPatientTotal) * 100) : 0
    },
    leadStages,
    funnel,
    lyfFunnel,
    funnelStages: RECOMMENDATION_STAGE_ENUM,
    appointmentFunnel: {
      periodDays: 30,
      booked: appt.booked,
      attended: appt.attended,
      cancelled: appt.cancelled,
      noShow: appt.noShow,
      rescheduled: appt.rescheduled,
      showUpRate: decided > 0 ? Math.round((appt.attended / decided) * 100) : 0
    }
  };
}

export async function getAdminAnalyticsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const userId = req?.user?._id?.toString?.() || "";
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Twelve months ago for patient growth
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const [
      doctorPerformanceRaw,
      patientGrowthRaw,
      serviceDistributionRaw,
      tagDistributionRaw,
      priorityRaw,
      crmStatusRaw,
      crmCategoryRaw,
      crmOverdueCount
    ] = await Promise.all([
      // Per-doctor appointment stats (last 30 days)
      Appointment.aggregate([
        { $match: { scheduledAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: "$doctor",
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            noShow: { $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } }
          }
        },
        { $sort: { total: -1 } }
      ]),

      // Patient growth (last 12 months)
      User.aggregate([
        { $match: { role: "patient", createdAt: { $gte: twelveMonthsAgo } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ]),

      // Service distribution
      PatientProfile.aggregate([
        { $unwind: "$services" },
        { $group: { _id: "$services", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // Tag distribution
      PatientProfile.aggregate([
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // Priority breakdown
      PatientProfile.aggregate([
        { $group: { _id: "$priority", count: { $sum: 1 } } }
      ]),

      // CRM status breakdown
      CrmTask.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),

      // CRM category breakdown
      CrmTask.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // Overdue CRM tasks
      CrmTask.countDocuments({
        status: { $in: ["pending", "in_progress"] },
        dueAt: { $lt: now, $ne: null }
      })
    ]);

    // Enrich doctor performance with names
    const doctorIds = doctorPerformanceRaw.map((d) => d._id).filter(Boolean);
    const doctorUsers = doctorIds.length > 0
      ? await User.find({ _id: { $in: doctorIds } }).select("name email userNumber").lean()
      : [];
    const doctorMap = new Map(doctorUsers.map((d) => [d._id.toString(), d]));

    const doctorPerformance = doctorPerformanceRaw
      .filter((d) => d._id)
      .map((d) => {
        const doc = doctorMap.get(d._id.toString());
        return {
          doctorId: d._id.toString(),
          doctorName: doc?.name || "Unknown",
          doctorEmail: doc?.email || "",
          userNumber: doc?.userNumber ?? null,
          total: d.total,
          completed: d.completed,
          noShow: d.noShow,
          cancelled: d.cancelled,
          completionRate: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
          noShowRate: d.total > 0 ? Math.round((d.noShow / d.total) * 100) : 0
        };
      });

    // Format patient growth
    const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const patientGrowth = patientGrowthRaw.map((g) => ({
      year: g._id.year,
      month: g._id.month,
      label: `${monthNames[g._id.month]} ${String(g._id.year).slice(2)}`,
      count: g.count
    }));

    // Format distributions
    const serviceDistribution = serviceDistributionRaw.map((s) => ({ service: s._id, count: s.count }));
    const tagDistribution = tagDistributionRaw.map((t) => ({ tag: t._id, count: t.count }));

    // Priority breakdown
    const priorityBreakdown = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const p of priorityRaw) {
      const key = p._id || "medium";
      if (key in priorityBreakdown) priorityBreakdown[key] = p.count;
    }

    // CRM analytics
    const crmStatusBreakdown = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
    for (const s of crmStatusRaw) {
      if (s._id in crmStatusBreakdown) crmStatusBreakdown[s._id] = s.count;
    }

    const crmCategoryBreakdown = crmCategoryRaw.map((c) => ({ category: c._id, count: c.count }));

    const growth = await buildGrowthAnalytics(now);

    return res.json({
      growth,
      doctorPerformance,
      patientGrowth,
      serviceDistribution,
      tagDistribution,
      priorityBreakdown,
      crmAnalytics: {
        statusBreakdown: crmStatusBreakdown,
        categoryBreakdown: crmCategoryBreakdown,
        overdueCount: crmOverdueCount
      },
      periodDays: 30
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to load analytics";
    return res.status(statusCode).json({ error: message });
  }
}
