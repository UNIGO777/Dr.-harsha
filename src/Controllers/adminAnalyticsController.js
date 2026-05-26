import { User } from "../Models/User.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { Appointment } from "../Models/Appointment.js";
import { CrmTask } from "../Models/CrmTask.js";

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

    return res.json({
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
