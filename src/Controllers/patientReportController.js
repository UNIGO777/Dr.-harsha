import { NurseProfile } from "../Models/NurseProfile.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { PatientReport } from "../Models/PatientReport.js";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeObject(value, fallback) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function normalizeStructuredSections(value) {
  const sections = normalizeObject(value, null);
  if (!sections) return null;

  return {
    patient: sections.patient ?? null,
    pastMedicalHistory: sections.pastMedicalHistory ?? null,
    surgicalHistory: sections.surgicalHistory ?? null,
    familyHistory: sections.familyHistory ?? null,
    sleepCycle: sections.sleepCycle ?? null,
    stressAssessment: sections.stressAssessment ?? null,
    pss10: sections.pss10 ?? null,
    socialFitness: sections.socialFitness ?? null,
    personalHistory: sections.personalHistory ?? null,
    womenSpecificHistory: sections.womenSpecificHistory ?? null,
    maleSpecificHistory: sections.maleSpecificHistory ?? null,
    maleQol: sections.maleQol ?? null,
    generalPhysicalExamination: sections.generalPhysicalExamination ?? null,
    bodyCompositionAnalysis: sections.bodyCompositionAnalysis ?? null,
    advancedBodyComposition: sections.advancedBodyComposition ?? null,
    boneHealth: sections.boneHealth ?? null,
    adultVaccination: sections.adultVaccination ?? null,
    cancerScreening: sections.cancerScreening ?? null,
    genesHealth: sections.genesHealth ?? null,
    allergyPanels: sections.allergyPanels ?? null,
    docsTests: sections.docsTests ?? null,
    arterialHealth: sections.arterialHealth ?? null,
    heartHealthScore: sections.heartHealthScore ?? null,
    brainHealthAssessment: sections.brainHealthAssessment ?? null,
    brainHealthPart1: sections.brainHealthPart1 ?? null,
    brainHealthPart2: sections.brainHealthPart2 ?? null,
    lungFunction: sections.lungFunction ?? null,
    liverHealth: sections.liverHealth ?? null,
    eyeHealth: sections.eyeHealth ?? null,
    kidneyHealth: sections.kidneyHealth ?? null,
    ultrasound: sections.ultrasound ?? null,
    exerciseAssessment: sections.exerciseAssessment ?? null,
    dietAssessment: sections.dietAssessment ?? null,
    ansAssessment: sections.ansAssessment ?? null,
    diabetesRisk: sections.diabetesRisk ?? null,
    womenHealth: sections.womenHealth ?? null,
    summary: sections.summary ?? null
  };
}

async function getManagedDoctorForNurse(nurseId) {
  const nurseProfile = await NurseProfile.findOne({ user: nurseId })
    .populate("assignedDoctor", "name email phone status userNumber")
    .lean();

  if (!nurseProfile?.assignedDoctor?._id) {
    return null;
  }

  return nurseProfile.assignedDoctor;
}

async function ensurePatientInNurseScope({ patientId, nurseId, managedDoctorId }) {
  const patientProfile = await PatientProfile.findOne({
    user: patientId,
    assignedNurses: nurseId,
    ...(managedDoctorId ? { assignedDoctors: managedDoctorId } : {})
  }).lean();

  if (!patientProfile?._id) {
    return null;
  }

  return patientProfile;
}

function buildPatientReportResponse(report) {
  if (!report?._id) return null;

  const rawSnapshots =
    report.stepSnapshots instanceof Map
      ? Object.fromEntries(report.stepSnapshots.entries())
      : normalizeObject(report.stepSnapshots, {});

  return {
    id: report._id.toString(),
    patientId: report.patient?._id?.toString?.() || report.patient?.toString?.() || "",
    assignedNurseId: report.assignedNurse?._id?.toString?.() || report.assignedNurse?.toString?.() || "",
    assignedDoctorId: report.assignedDoctor?._id?.toString?.() || report.assignedDoctor?.toString?.() || "",
    reportValues: normalizeObject(report.reportValues, {}),
    generatedReport: report.generatedReport ?? null,
    advancedBodyComposition: report.advancedBodyComposition ?? null,
    docsTestsAnalysis: report.docsTestsAnalysis ?? null,
    ultrasoundAnalysis: report.ultrasoundAnalysis ?? null,
    structuredSections: normalizeStructuredSections(report.structuredSections),
    stepSnapshots: rawSnapshots,
    activeStepId: normalizeString(report.activeStepId),
    lastSavedStepId: normalizeString(report.lastSavedStepId),
    lastSavedAt: report.lastSavedAt || report.updatedAt || report.createdAt || null,
    createdAt: report.createdAt || null,
    updatedAt: report.updatedAt || null
  };
}

export async function getPatientReportController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = normalizeString(req?.params?.patientId);
    if (!patientId) return res.status(400).json({ error: "patientId is required" });

    const managedDoctor = await getManagedDoctorForNurse(nurseId);
    const patientProfile = await ensurePatientInNurseScope({
      patientId,
      nurseId,
      managedDoctorId: managedDoctor?._id?.toString?.() || ""
    });

    if (!patientProfile?._id) {
      return res.status(403).json({ error: "This patient is outside your assignment scope" });
    }

    const report = await PatientReport.findOne({ patient: patientId }).lean();
    return res.json({ report: buildPatientReportResponse(report) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch patient report";
    return res.status(500).json({ error: message });
  }
}

export async function savePatientReportController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const patientId = normalizeString(req?.params?.patientId);
    if (!patientId) return res.status(400).json({ error: "patientId is required" });

    const stepId = normalizeString(req?.body?.stepId);
    const reportValues = normalizeObject(req?.body?.reportValues, null);
    const structuredSections = normalizeStructuredSections(req?.body?.structuredSections);

    if (!reportValues) {
      return res.status(400).json({ error: "reportValues is required" });
    }

    const managedDoctor = await getManagedDoctorForNurse(nurseId);
    const patientProfile = await ensurePatientInNurseScope({
      patientId,
      nurseId,
      managedDoctorId: managedDoctor?._id?.toString?.() || ""
    });

    if (!patientProfile?._id) {
      return res.status(403).json({ error: "This patient is outside your assignment scope" });
    }

    let report = await PatientReport.findOne({ patient: patientId });
    if (!report?._id) {
      report = new PatientReport({
        patient: patientId,
        assignedNurse: nurseId,
        assignedDoctor: managedDoctor?._id || null,
        createdBy: nurseId
      });
    }

    report.assignedNurse = nurseId;
    report.assignedDoctor = managedDoctor?._id || null;
    report.reportValues = reportValues;
    report.generatedReport = req?.body?.generatedReport ?? report.generatedReport ?? null;
    report.advancedBodyComposition = req?.body?.advancedBodyComposition ?? report.advancedBodyComposition ?? null;
    report.docsTestsAnalysis = req?.body?.docsTestsAnalysis ?? report.docsTestsAnalysis ?? null;
    report.ultrasoundAnalysis = req?.body?.ultrasoundAnalysis ?? report.ultrasoundAnalysis ?? null;
    if (structuredSections) {
      report.structuredSections = structuredSections;
    }
    report.activeStepId = stepId || report.activeStepId || "";
    report.lastSavedStepId = stepId || report.lastSavedStepId || "";
    report.lastSavedAt = new Date();
    report.updatedBy = nurseId;

    if (stepId) {
      report.stepSnapshots.set(stepId, {
        data: req?.body?.currentStepData ?? {},
        savedAt: new Date()
      });
    }

    await report.save();
    return res.json({
      message: stepId ? `Saved ${stepId} step successfully` : "Report saved successfully",
      report: buildPatientReportResponse(report.toObject())
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save patient report";
    return res.status(500).json({ error: message });
  }
}
