import { PatientReport } from "../Models/PatientReport.js";

/**
 * GET /api/patient/lifestyle-plan
 * Extract diet and lifestyle recommendations from the latest holisticPlan
 */
export async function getLifestylePlanController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const report = await PatientReport.findOne(
      { patient: patientId, holisticPlan: { $ne: null } },
      { holisticPlan: 1, reportNumber: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .lean();

    if (!report || !report.holisticPlan) {
      return res.json({ plan: null });
    }

    const plan = report.holisticPlan;

    const lifestylePlan = {
      reportId: report._id,
      reportNumber: report.reportNumber,
      createdAt: report.createdAt,
      diet: plan.diet || plan.dietPlan || plan.nutrition || null,
      exercise: plan.exercise || plan.exercisePlan || plan.physicalActivity || null,
      lifestyle: plan.lifestyle || plan.lifestyleModifications || null,
      sleep: plan.sleep || plan.sleepRecommendations || null,
      stress: plan.stress || plan.stressManagement || null,
    };

    return res.json({ plan: lifestylePlan });
  } catch (err) {
    console.error("getLifestylePlan error:", err);
    return res.status(500).json({ message: "Failed to fetch lifestyle plan" });
  }
}

/**
 * POST /api/patient/lifestyle-plan/checklist
 * Mark daily checklist items for the current date
 */
export async function updateChecklistController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });
    const { items } = req.body; // array of { key, completed }

    if (!Array.isArray(items)) {
      return res.status(400).json({ message: "items must be an array" });
    }

    const report = await PatientReport.findOne(
      { patient: patientId, holisticPlan: { $ne: null } }
    ).sort({ createdAt: -1 });

    if (!report) return res.status(404).json({ message: "No lifestyle plan found" });

    const plan = report.holisticPlan || {};
    if (!plan.checklist) plan.checklist = {};

    const today = new Date().toISOString().split("T")[0];
    if (!plan.checklist[today]) plan.checklist[today] = {};

    for (const item of items) {
      if (item.key) {
        plan.checklist[today][item.key] = !!item.completed;
      }
    }

    report.holisticPlan = plan;
    report.markModified("holisticPlan");
    await report.save();

    return res.json({ message: "Checklist updated", date: today, checklist: plan.checklist[today] });
  } catch (err) {
    console.error("updateChecklist error:", err);
    return res.status(500).json({ message: "Failed to update checklist" });
  }
}

/**
 * GET /api/patient/lifestyle-plan/adherence
 * Calculate weekly adherence stats from checklist data
 */
export async function getAdherenceController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const report = await PatientReport.findOne(
      { patient: patientId, holisticPlan: { $ne: null } },
      { holisticPlan: 1 }
    )
      .sort({ createdAt: -1 })
      .lean();

    if (!report || !report.holisticPlan?.checklist) {
      return res.json({ adherence: { totalDays: 0, completedItems: 0, totalItems: 0, score: 0 } });
    }

    const checklist = report.holisticPlan.checklist;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let totalItems = 0;
    let completedItems = 0;
    let totalDays = 0;

    for (const [dateStr, items] of Object.entries(checklist)) {
      const d = new Date(dateStr);
      if (d >= weekAgo && d <= now) {
        totalDays++;
        const entries = Object.values(items);
        totalItems += entries.length;
        completedItems += entries.filter(Boolean).length;
      }
    }

    const score = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return res.json({ adherence: { totalDays, completedItems, totalItems, score } });
  } catch (err) {
    console.error("getAdherence error:", err);
    return res.status(500).json({ message: "Failed to fetch adherence" });
  }
}
