import { PatientReport } from "../Models/PatientReport.js";

/**
 * GET /api/patient/specialists
 * Extract specialist referrals from holisticPlan in patient reports
 */
export async function listSpecialistReferralsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const reports = await PatientReport.find(
      { patient: patientId, holisticPlan: { $ne: null } },
      { holisticPlan: 1, reportNumber: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .lean();

    const referrals = [];
    for (const report of reports) {
      const plan = report.holisticPlan;
      const specialists = plan?.specialistCare || plan?.specialists || plan?.referrals || [];
      if (Array.isArray(specialists)) {
        for (let i = 0; i < specialists.length; i++) {
          const spec = specialists[i];
          referrals.push({
            id: `${report._id}_${i}`,
            index: i,
            reportId: report._id,
            reportNumber: report.reportNumber,
            specialistType: spec.specialistType || spec.type || spec.specialist || "Unknown",
            reason: spec.reason || spec.description || "",
            urgency: spec.urgency || "routine",
            status: spec.status || "pending",
            clinic: spec.clinic || spec.hospital || "",
            date: spec.date || null,
            createdAt: report.createdAt,
          });
        }
      }
    }

    return res.json({ referrals });
  } catch (err) {
    console.error("listSpecialistReferrals error:", err);
    return res.status(500).json({ message: "Failed to fetch specialist referrals" });
  }
}

/**
 * PUT /api/patient/specialists/:reportId/:index/status
 * Update referral status in the holisticPlan
 */
export async function updateSpecialistStatusController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });
    const { reportId, index } = req.params;
    const { status, date } = req.body;

    if (!["pending", "booked", "completed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Must be pending, booked, or completed" });
    }

    const report = await PatientReport.findOne({ _id: reportId, patient: patientId });
    if (!report) return res.status(404).json({ message: "Report not found" });

    const plan = report.holisticPlan || {};
    const specialists = plan.specialistCare || plan.specialists || plan.referrals || [];
    const idx = parseInt(index, 10);

    if (!Array.isArray(specialists) || idx < 0 || idx >= specialists.length) {
      return res.status(404).json({ message: "Referral not found" });
    }

    specialists[idx].status = status;
    if (date) specialists[idx].date = date;

    // Write back
    if (plan.specialistCare) plan.specialistCare = specialists;
    else if (plan.specialists) plan.specialists = specialists;
    else if (plan.referrals) plan.referrals = specialists;
    else plan.specialistCare = specialists;

    report.holisticPlan = plan;
    report.markModified("holisticPlan");
    await report.save();

    return res.json({ message: "Status updated", status });
  } catch (err) {
    console.error("updateSpecialistStatus error:", err);
    return res.status(500).json({ message: "Failed to update status" });
  }
}
