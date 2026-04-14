import mongoose from "mongoose";

const reportSectionField = { type: mongoose.Schema.Types.Mixed, default: null };

const patientReportStepSnapshotSchema = new mongoose.Schema(
  {
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    savedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const patientReportUploadedDocumentSchema = new mongoose.Schema(
  {
    stepId: { type: String, trim: true, required: true, index: true },
    originalName: { type: String, trim: true, required: true },
    storedName: { type: String, trim: true, required: true },
    relativePath: { type: String, trim: true, required: true },
    checksum: { type: String, trim: true, required: true },
    mimeType: { type: String, trim: true, default: "" },
    size: { type: Number, min: 0, default: 0 },
    usedForExtraction: { type: Boolean, default: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const patientReportSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reportNumber: { type: Number, required: true, min: 1 },
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
    uploadedDocuments: {
      type: [patientReportUploadedDocumentSchema],
      default: []
    },
    activeStepId: { type: String, trim: true, default: "" },
    lastSavedStepId: { type: String, trim: true, default: "" },
    lastSavedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

patientReportSchema.index({ patient: 1, createdAt: -1 });
patientReportSchema.index({ patient: 1, reportNumber: 1 }, { unique: true });

export const PatientReport =
  mongoose.models.PatientReport || mongoose.model("PatientReport", patientReportSchema);
