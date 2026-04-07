import mongoose from "mongoose";

const reportSectionField = { type: mongoose.Schema.Types.Mixed, default: null };

const patientReportStepSnapshotSchema = new mongoose.Schema(
  {
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    savedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const patientReportSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    assignedNurse: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    reportValues: { type: mongoose.Schema.Types.Mixed, default: {} },
    generatedReport: { type: mongoose.Schema.Types.Mixed, default: null },
    advancedBodyComposition: { type: mongoose.Schema.Types.Mixed, default: null },
    docsTestsAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },
    ultrasoundAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },
    structuredSections: {
      patient: reportSectionField,
      pastMedicalHistory: reportSectionField,
      surgicalHistory: reportSectionField,
      familyHistory: reportSectionField,
      sleepCycle: reportSectionField,
      stressAssessment: reportSectionField,
      pss10: reportSectionField,
      socialFitness: reportSectionField,
      personalHistory: reportSectionField,
      womenSpecificHistory: reportSectionField,
      maleSpecificHistory: reportSectionField,
      maleQol: reportSectionField,
      generalPhysicalExamination: reportSectionField,
      bodyCompositionAnalysis: reportSectionField,
      advancedBodyComposition: reportSectionField,
      boneHealth: reportSectionField,
      adultVaccination: reportSectionField,
      cancerScreening: reportSectionField,
      genesHealth: reportSectionField,
      allergyPanels: reportSectionField,
      docsTests: reportSectionField,
      arterialHealth: reportSectionField,
      heartHealthScore: reportSectionField,
      brainHealthAssessment: reportSectionField,
      brainHealthPart1: reportSectionField,
      brainHealthPart2: reportSectionField,
      lungFunction: reportSectionField,
      liverHealth: reportSectionField,
      eyeHealth: reportSectionField,
      kidneyHealth: reportSectionField,
      ultrasound: reportSectionField,
      exerciseAssessment: reportSectionField,
      dietAssessment: reportSectionField,
      ansAssessment: reportSectionField,
      diabetesRisk: reportSectionField,
      womenHealth: reportSectionField,
      summary: reportSectionField
    },
    stepSnapshots: {
      type: Map,
      of: patientReportStepSnapshotSchema,
      default: {}
    },
    activeStepId: { type: String, trim: true, default: "" },
    lastSavedStepId: { type: String, trim: true, default: "" },
    lastSavedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

export const PatientReport =
  mongoose.models.PatientReport || mongoose.model("PatientReport", patientReportSchema);
