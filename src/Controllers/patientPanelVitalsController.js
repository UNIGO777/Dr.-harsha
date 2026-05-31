import { PatientVital, VITAL_TYPES, VITAL_UNITS } from "../Models/PatientVital.js";
import { PatientGoal } from "../Models/PatientGoal.js";
import { Notification } from "../Models/Notification.js";
import { PatientProfile } from "../Models/PatientProfile.js";

function validateVitalValue(type, value) {
  switch (type) {
    case "blood_pressure":
      if (!value || typeof value !== "object") return "Blood pressure requires { systolic, diastolic }";
      if (!value.systolic || value.systolic < 60 || value.systolic > 250) return "Systolic must be 60-250";
      if (!value.diastolic || value.diastolic < 40 || value.diastolic > 150) return "Diastolic must be 40-150";
      return null;
    case "blood_sugar":
      if (!value || typeof value !== "object") return "Blood sugar requires { reading, subType }";
      if (!value.reading || value.reading < 20 || value.reading > 600) return "Reading must be 20-600";
      if (!["fasting", "post_meal", "random", "hba1c"].includes(value.subType)) return "subType must be fasting, post_meal, random, or hba1c";
      return null;
    case "weight":
      if (typeof value !== "number" || value < 1 || value > 300) return "Weight must be 1-300 kg";
      return null;
    case "heart_rate":
      if (typeof value !== "number" || value < 30 || value > 250) return "Heart rate must be 30-250 bpm";
      return null;
    case "spo2":
      if (typeof value !== "number" || value < 50 || value > 100) return "SpO2 must be 50-100%";
      return null;
    case "temperature":
      if (typeof value !== "number" || value < 90 || value > 110) return "Temperature must be 90-110°F";
      return null;
    default:
      return "Invalid vital type";
  }
}

function isVitalCritical(type, value) {
  switch (type) {
    case "blood_pressure":
      if (value.systolic > 180 || value.systolic < 90 || value.diastolic > 120 || value.diastolic < 60)
        return { isCritical: true, message: "Blood pressure is in critical range" };
      return { isCritical: false };
    case "blood_sugar":
      if (value.reading > 400 || value.reading < 50)
        return { isCritical: true, message: "Blood sugar is in critical range" };
      return { isCritical: false };
    case "heart_rate":
      if (value > 150 || value < 40)
        return { isCritical: true, message: "Heart rate is in critical range" };
      return { isCritical: false };
    case "spo2":
      if (value < 90)
        return { isCritical: true, message: "SpO2 is critically low" };
      return { isCritical: false };
    default:
      return { isCritical: false };
  }
}

export async function listVitalsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { type, startDate, endDate, page = 1, limit = 30 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const skip = (pageNum - 1) * limitNum;

    const query = { patient: patientId };
    if (type && VITAL_TYPES.includes(type)) query.type = type;
    if (startDate || endDate) {
      query.recordedAt = {};
      if (startDate) query.recordedAt.$gte = new Date(startDate);
      if (endDate) query.recordedAt.$lte = new Date(endDate);
    }

    const [vitals, total] = await Promise.all([
      PatientVital.find(query).sort({ recordedAt: -1 }).skip(skip).limit(limitNum).lean(),
      PatientVital.countDocuments(query)
    ]);

    return res.json({
      vitals: vitals.map((v) => ({
        id: v._id.toString(),
        type: v.type,
        value: v.value,
        unit: v.unit,
        recordedAt: v.recordedAt,
        notes: v.notes || "",
        createdAt: v.createdAt
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    console.error("listVitalsController error:", err);
    return res.status(500).json({ error: "Failed to load vitals" });
  }
}

export async function addVitalController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { type, value, recordedAt, notes } = req.body;

    if (!type || !VITAL_TYPES.includes(type)) {
      return res.status(400).json({ error: "Valid vital type is required" });
    }

    const validationError = validateVitalValue(type, value);
    if (validationError) return res.status(400).json({ error: validationError });

    const unit = VITAL_UNITS[type];

    const vital = await PatientVital.create({
      patient: patientId,
      type,
      value,
      unit,
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      notes: (notes || "").trim()
    });

    // Check if critical
    const criticalCheck = isVitalCritical(type, value);
    if (criticalCheck.isCritical) {
      const profile = await PatientProfile.findOne({ user: patientId }).lean();
      const assignedNurse = profile?.assignedNurses?.[0];
      if (assignedNurse) {
        await Notification.create({
          user: assignedNurse,
          type: "vital_alert",
          title: "Critical Vital Reading",
          message: `Patient ${req.user.name || ""} recorded critical ${type.replace(/_/g, " ")}: ${JSON.stringify(value)} ${unit}`,
          metadata: { patientId, vitalId: vital._id.toString(), type, value },
          createdBy: patientId
        });
      }
    }

    return res.status(201).json({
      success: true,
      vital: {
        id: vital._id.toString(),
        type: vital.type,
        value: vital.value,
        unit: vital.unit,
        recordedAt: vital.recordedAt
      },
      critical: criticalCheck.isCritical ? criticalCheck.message : null
    });
  } catch (err) {
    console.error("addVitalController error:", err);
    return res.status(500).json({ error: "Failed to add vital" });
  }
}

export async function deleteVitalController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const vital = await PatientVital.findOneAndDelete({ _id: id, patient: patientId });
    if (!vital) return res.status(404).json({ error: "Vital not found" });

    return res.json({ success: true });
  } catch (err) {
    console.error("deleteVitalController error:", err);
    return res.status(500).json({ error: "Failed to delete vital" });
  }
}

export async function getVitalTrendsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { type, period = "30d" } = req.query;
    if (!type || !VITAL_TYPES.includes(type)) {
      return res.status(400).json({ error: "Valid vital type is required" });
    }

    const periodDays = { "7d": 7, "30d": 30, "90d": 90, "6m": 180, "1y": 365 };
    const days = periodDays[period] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const vitals = await PatientVital.find({
      patient: patientId,
      type,
      recordedAt: { $gte: startDate }
    }).sort({ recordedAt: 1 }).lean();

    const dataPoints = vitals.map((v) => ({
      date: v.recordedAt,
      value: v.value,
      notes: v.notes || ""
    }));

    // Calculate summary
    let latest = null;
    let summary = {};
    if (dataPoints.length > 0) {
      latest = dataPoints[dataPoints.length - 1];

      if (type === "blood_pressure") {
        const systolics = dataPoints.map((d) => d.value.systolic);
        const diastolics = dataPoints.map((d) => d.value.diastolic);
        summary = {
          avgSystolic: Math.round(systolics.reduce((a, b) => a + b, 0) / systolics.length),
          avgDiastolic: Math.round(diastolics.reduce((a, b) => a + b, 0) / diastolics.length),
          count: dataPoints.length
        };
      } else if (type === "blood_sugar") {
        const readings = dataPoints.map((d) => d.value.reading);
        summary = {
          avg: Math.round(readings.reduce((a, b) => a + b, 0) / readings.length),
          min: Math.min(...readings),
          max: Math.max(...readings),
          count: dataPoints.length
        };
      } else {
        const values = dataPoints.map((d) => typeof d.value === "number" ? d.value : 0);
        summary = {
          avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
          min: Math.min(...values),
          max: Math.max(...values),
          count: dataPoints.length
        };
      }
    }

    return res.json({ type, period, dataPoints, latest, summary });
  } catch (err) {
    console.error("getVitalTrendsController error:", err);
    return res.status(500).json({ error: "Failed to load trends" });
  }
}

// ── Goals ──
export async function listGoalsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const goals = await PatientGoal.find({ patient: patientId }).sort({ createdAt: -1 }).lean();

    return res.json({
      goals: goals.map((g) => ({
        id: g._id.toString(),
        type: g.type,
        title: g.title,
        targetValue: g.targetValue,
        currentValue: g.currentValue,
        unit: g.unit,
        deadline: g.deadline,
        status: g.status,
        achievedAt: g.achievedAt,
        setBy: g.setBy,
        createdAt: g.createdAt
      }))
    });
  } catch (err) {
    console.error("listGoalsController error:", err);
    return res.status(500).json({ error: "Failed to load goals" });
  }
}

export async function createOrUpdateGoalController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { id, type, title, targetValue, unit, deadline, status } = req.body;

    if (id) {
      // Update
      const update = {};
      if (status === "achieved") {
        update.status = "achieved";
        update.achievedAt = new Date();
      } else if (status === "abandoned") {
        update.status = "abandoned";
      }
      if (targetValue !== undefined) update.targetValue = targetValue;
      if (title) update.title = title.trim();
      if (deadline) update.deadline = new Date(deadline);

      const goal = await PatientGoal.findOneAndUpdate(
        { _id: id, patient: patientId },
        { $set: update },
        { new: true }
      ).lean();

      if (!goal) return res.status(404).json({ error: "Goal not found" });

      return res.json({
        success: true,
        goal: {
          id: goal._id.toString(),
          type: goal.type,
          title: goal.title,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          unit: goal.unit,
          status: goal.status,
          deadline: goal.deadline,
          achievedAt: goal.achievedAt,
          createdAt: goal.createdAt
        }
      });
    }

    // Create
    if (!type || !title?.trim() || targetValue === undefined) {
      return res.status(400).json({ error: "type, title, and targetValue are required" });
    }

    const goal = await PatientGoal.create({
      patient: patientId,
      type,
      title: title.trim(),
      targetValue,
      unit: unit || "",
      deadline: deadline ? new Date(deadline) : null,
      setBy: "patient"
    });

    return res.status(201).json({
      success: true,
      goal: {
        id: goal._id.toString(),
        type: goal.type,
        title: goal.title,
        targetValue: goal.targetValue,
        unit: goal.unit,
        status: goal.status,
        deadline: goal.deadline,
        createdAt: goal.createdAt
      }
    });
  } catch (err) {
    console.error("createOrUpdateGoalController error:", err);
    return res.status(500).json({ error: "Failed to save goal" });
  }
}
