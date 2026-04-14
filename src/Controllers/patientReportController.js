import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { NurseProfile } from "../Models/NurseProfile.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { PatientReport } from "../Models/PatientReport.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_DOCUMENTS_DIR = path.join(__dirname, "..", "..", "uploads", "patient-report-documents");

let patientReportIndexesEnsured = false;
let patientReportIndexPromise = null;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeObject(value, fallback) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeFileNamePart(value, fallback = "file") {
  const raw = normalizeString(value);
  const sanitized = raw.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return sanitized || fallback;
}

function buildStoredDocumentName(originalName) {
  const ext = path.extname(normalizeString(originalName)).slice(0, 20);
  const base = path.basename(normalizeString(originalName), ext);
  const safeBase = sanitizeFileNamePart(base, "document").slice(0, 80);
  const safeExt = ext ? `.${sanitizeFileNamePart(ext.slice(1), "bin").slice(0, 10)}` : "";
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeBase}${safeExt}`;
}

function buildFileChecksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function ensurePatientReportIndexes() {
  if (patientReportIndexesEnsured) return;
  if (patientReportIndexPromise) {
    await patientReportIndexPromise;
    return;
  }

  patientReportIndexPromise = (async () => {
    const collection = PatientReport.collection;
    const initialIndexes = await collection.indexes().catch(() => []);
    const legacyPatientIndex = initialIndexes.find(
      (index) =>
        index?.unique &&
        index?.key &&
        Object.keys(index.key).length === 1 &&
        index.key.patient === 1,
    );

    if (legacyPatientIndex?.name) {
      await collection.dropIndex(legacyPatientIndex.name).catch((err) => {
        if (err?.codeName === "IndexNotFound" || err?.code === 27) return;
        throw err;
      });
    }

    const indexNames = new Set(
      normalizeArray(await collection.indexes().catch(() => [])).map((index) => normalizeString(index?.name)),
    );

    if (!indexNames.has("patient_1_reportNumber_1")) {
      await collection.createIndex({ patient: 1, reportNumber: 1 }, { unique: true, name: "patient_1_reportNumber_1" });
    }

    if (!indexNames.has("patient_1_createdAt_-1")) {
      await collection.createIndex({ patient: 1, createdAt: -1 }, { name: "patient_1_createdAt_-1" });
    }

    patientReportIndexesEnsured = true;
  })();

  try {
    await patientReportIndexPromise;
  } finally {
    patientReportIndexPromise = null;
  }
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
    summary: sections.summary ?? null,
  };
}

function isValidReportId(reportId) {
  return mongoose.Types.ObjectId.isValid(reportId);
}

function toDocumentResponse(patientId, reportId, document) {
  if (!document?._id) return null;

  return {
    id: document._id.toString(),
    patientId,
    reportId,
    stepId: normalizeString(document.stepId),
    originalName: normalizeString(document.originalName),
    mimeType: normalizeString(document.mimeType),
    size: typeof document.size === "number" ? document.size : 0,
    usedForExtraction: document?.usedForExtraction !== false,
    uploadedById: document.uploadedBy?._id?.toString?.() || document.uploadedBy?.toString?.() || "",
    uploadedAt: document.uploadedAt || null,
    downloadUrl: `/api/users/patients/${patientId}/reports/${reportId}/documents/${document._id.toString()}`,
  };
}

async function getManagedDoctorForDoctor(doctorId) {
  const patientProfiles = await PatientProfile.findOne({ assignedDoctors: doctorId }).select("_id").lean();
  return patientProfiles?._id ? { _id: doctorId } : null;
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
    ...(managedDoctorId ? { assignedDoctors: managedDoctorId } : {}),
  }).lean();

  if (!patientProfile?._id) {
    return null;
  }

  return patientProfile;
}

async function ensurePatientInActorScope({ patientId, actor }) {
  const actorId = actor?._id?.toString?.() || "";
  if (!actorId) return null;

  if (actor?.role === "nurse") {
    const managedDoctor = await getManagedDoctorForNurse(actorId);
    const patientProfile = await ensurePatientInNurseScope({
      patientId,
      nurseId: actorId,
      managedDoctorId: managedDoctor?._id?.toString?.() || "",
    });
    return { patientProfile, managedDoctor };
  }

  if (actor?.role === "doctor") {
    const patientProfile = await PatientProfile.findOne({
      user: patientId,
      assignedDoctors: actorId,
    }).lean();
    const managedDoctor = await getManagedDoctorForDoctor(actorId);
    return { patientProfile, managedDoctor };
  }

  return { patientProfile: null, managedDoctor: null };
}

async function ensureReportDirectory(patientId, reportId) {
  const targetDir = path.join(
    REPORT_DOCUMENTS_DIR,
    sanitizeFileNamePart(patientId, "patient"),
    sanitizeFileNamePart(reportId, "report"),
  );
  await fs.mkdir(targetDir, { recursive: true });
  return targetDir;
}

function buildPatientReportResponse(report) {
  if (!report?._id) return null;

  const rawSnapshots =
    report.stepSnapshots instanceof Map
      ? Object.fromEntries(report.stepSnapshots.entries())
      : normalizeObject(report.stepSnapshots, {});

  const patientId = report.patient?._id?.toString?.() || report.patient?.toString?.() || "";
  const reportId = report._id.toString();
  const uploadedDocuments = normalizeArray(report.uploadedDocuments)
    .map((document) => toDocumentResponse(patientId, reportId, document))
    .filter(Boolean);

  return {
    id: reportId,
    patientId,
    reportNumber: typeof report.reportNumber === "number" ? report.reportNumber : null,
    assignedNurseId: report.assignedNurse?._id?.toString?.() || report.assignedNurse?.toString?.() || "",
    assignedDoctorId: report.assignedDoctor?._id?.toString?.() || report.assignedDoctor?.toString?.() || "",
    reportValues: normalizeObject(report.reportValues, {}),
    generatedReport: report.generatedReport ?? null,
    advancedBodyComposition: report.advancedBodyComposition ?? null,
    docsTestsAnalysis: report.docsTestsAnalysis ?? null,
    ultrasoundAnalysis: report.ultrasoundAnalysis ?? null,
    structuredSections: normalizeStructuredSections(report.structuredSections),
    uploadedDocuments,
    uploadedDocumentCount: uploadedDocuments.length,
    stepSnapshots: rawSnapshots,
    activeStepId: normalizeString(report.activeStepId),
    lastSavedStepId: normalizeString(report.lastSavedStepId),
    lastSavedAt: report.lastSavedAt || report.updatedAt || report.createdAt || null,
    createdAt: report.createdAt || null,
    updatedAt: report.updatedAt || null,
  };
}

async function getNextPatientReportNumber(patientId) {
  const latestReport = await PatientReport.findOne({ patient: patientId }).sort({ reportNumber: -1 }).select("reportNumber").lean();
  const latestNumber = typeof latestReport?.reportNumber === "number" ? latestReport.reportNumber : 0;
  return latestNumber + 1;
}

async function ensurePatientReportNumbers(patientId) {
  const reports = await PatientReport.find({ patient: patientId })
    .sort({ createdAt: 1, _id: 1 })
    .select("_id reportNumber")
    .lean();

  let nextReportNumber = 1;

  for (const report of reports) {
    if (typeof report?.reportNumber === "number" && Number.isFinite(report.reportNumber) && report.reportNumber >= nextReportNumber) {
      nextReportNumber = report.reportNumber + 1;
      continue;
    }

    await PatientReport.updateOne({ _id: report._id }, { $set: { reportNumber: nextReportNumber } });
    nextReportNumber += 1;
  }
}

async function createEmptyPatientReport({ patientId, nurseId, managedDoctorId }) {
  const reportNumber = await getNextPatientReportNumber(patientId);
  const report = new PatientReport({
    patient: patientId,
    reportNumber,
    assignedNurse: nurseId,
    assignedDoctor: managedDoctorId || null,
    createdBy: nurseId,
    updatedBy: nurseId,
  });
  await report.save();
  return report;
}

async function findPatientReport({ patientId, reportId, lean = false }) {
  if (reportId && !isValidReportId(reportId)) return null;
  const query = reportId
    ? PatientReport.findOne({ _id: reportId, patient: patientId })
    : PatientReport.findOne({ patient: patientId }).sort({ createdAt: -1, reportNumber: -1 });
  return lean ? query.lean() : query;
}

async function ensurePatientReportAccess({ req, allowDoctor = true }) {
  if (!req?.app?.locals?.dbReady) {
    return { error: { status: 500, body: { error: "Database not configured" } } };
  }

  await ensurePatientReportIndexes();

  const actor = req?.user;
  const actorId = actor?._id?.toString?.() || "";
  if (!actorId) {
    return { error: { status: 401, body: { error: "Unauthorized" } } };
  }

  const patientId = normalizeString(req?.params?.patientId);
  if (!patientId) {
    return { error: { status: 400, body: { error: "patientId is required" } } };
  }

  if (!allowDoctor && actor?.role !== "nurse") {
    return { error: { status: 403, body: { error: "Only nurses can modify reports" } } };
  }

  const { patientProfile, managedDoctor } = await ensurePatientInActorScope({ patientId, actor });
  if (!patientProfile?._id) {
    return { error: { status: 403, body: { error: "This patient is outside your assignment scope" } } };
  }

  await ensurePatientReportNumbers(patientId);

  return { actor, actorId, patientId, managedDoctor, patientProfile };
}

export async function listPatientReportsController(req, res) {
  try {
    const access = await ensurePatientReportAccess({ req, allowDoctor: true });
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const reports = await PatientReport.find({ patient: access.patientId }).sort({ createdAt: -1, reportNumber: -1 }).lean();
    return res.json({ reports: reports.map((report) => buildPatientReportResponse(report)).filter(Boolean) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list patient reports";
    return res.status(500).json({ error: message });
  }
}

export async function createPatientReportController(req, res) {
  try {
    const access = await ensurePatientReportAccess({ req, allowDoctor: false });
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const report = await createEmptyPatientReport({
      patientId: access.patientId,
      nurseId: access.actorId,
      managedDoctorId: access.managedDoctor?._id || null,
    });

    return res.status(201).json({
      message: "New patient report created successfully",
      report: buildPatientReportResponse(report.toObject()),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create patient report";
    return res.status(500).json({ error: message });
  }
}

export async function getPatientReportController(req, res) {
  try {
    const access = await ensurePatientReportAccess({ req, allowDoctor: true });
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const reportId = normalizeString(req?.params?.reportId);
    const report = await findPatientReport({ patientId: access.patientId, reportId, lean: true });
    return res.json({ report: buildPatientReportResponse(report) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch patient report";
    return res.status(500).json({ error: message });
  }
}

export async function savePatientReportController(req, res) {
  try {
    const access = await ensurePatientReportAccess({ req, allowDoctor: false });
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const reportId = normalizeString(req?.params?.reportId || req?.body?.reportId);
    if (!reportId) return res.status(400).json({ error: "reportId is required" });

    const stepId = normalizeString(req?.body?.stepId);
    const reportValues = normalizeObject(req?.body?.reportValues, null);
    const structuredSections = normalizeStructuredSections(req?.body?.structuredSections);

    if (!reportValues) {
      return res.status(400).json({ error: "reportValues is required" });
    }

    const report = await findPatientReport({ patientId: access.patientId, reportId, lean: false });
    if (!report?._id) {
      return res.status(404).json({ error: "Patient report not found" });
    }

    report.assignedNurse = access.actorId;
    report.assignedDoctor = access.managedDoctor?._id || null;
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
    report.updatedBy = access.actorId;

    if (stepId) {
      report.stepSnapshots.set(stepId, {
        data: req?.body?.currentStepData ?? {},
        savedAt: new Date(),
      });
    }

    await report.save();
    return res.json({
      message: stepId ? `Saved ${stepId} step successfully` : "Report saved successfully",
      report: buildPatientReportResponse(report.toObject()),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save patient report";
    return res.status(500).json({ error: message });
  }
}

export async function uploadPatientReportDocumentsController(req, res) {
  try {
    const access = await ensurePatientReportAccess({ req, allowDoctor: false });
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const reportId = normalizeString(req?.params?.reportId || req?.body?.reportId);
    const stepId = normalizeString(req?.body?.stepId);
    const files = normalizeArray(req?.files);

    if (!reportId) return res.status(400).json({ error: "reportId is required" });
    if (!stepId) return res.status(400).json({ error: "stepId is required" });
    if (files.length === 0) return res.status(400).json({ error: "At least one file is required" });

    const report = await findPatientReport({ patientId: access.patientId, reportId, lean: false });
    if (!report?._id) return res.status(404).json({ error: "Patient report not found" });

    const reportDir = await ensureReportDirectory(access.patientId, report._id.toString());
    const createdDocuments = [];
    const existingDocuments = normalizeArray(report.uploadedDocuments);

    for (const file of files) {
      const buffer = file?.buffer;
      if (!buffer || !Buffer.isBuffer(buffer)) continue;

      const originalName = normalizeString(file?.originalname) || "document";
      const checksum = buildFileChecksum(buffer);
      const duplicate = existingDocuments.find(
        (item) => normalizeString(item?.stepId) === stepId && normalizeString(item?.checksum) === checksum,
      );
      if (duplicate?._id) {
        createdDocuments.push(duplicate);
        continue;
      }

      const storedName = buildStoredDocumentName(originalName);
      const absolutePath = path.join(reportDir, storedName);
      await fs.writeFile(absolutePath, buffer);

      const relativePath = path.relative(REPORT_DOCUMENTS_DIR, absolutePath);
      const document = {
        stepId,
        originalName,
        storedName,
        relativePath,
        checksum,
        mimeType: normalizeString(file?.mimetype),
        size: typeof file?.size === "number" ? file.size : buffer.length,
        usedForExtraction: true,
        uploadedBy: access.actorId,
        uploadedAt: new Date(),
      };

      report.uploadedDocuments.push(document);
      createdDocuments.push(report.uploadedDocuments[report.uploadedDocuments.length - 1]);
    }

    report.assignedNurse = access.actorId;
    report.assignedDoctor = access.managedDoctor?._id || null;
    report.activeStepId = stepId || report.activeStepId || "";
    report.lastSavedStepId = stepId || report.lastSavedStepId || "";
    report.lastSavedAt = new Date();
    report.updatedBy = access.actorId;

    await report.save();

    return res.status(201).json({
      message: "Report documents uploaded successfully",
      documents: createdDocuments
        .map((document) => toDocumentResponse(access.patientId, report._id.toString(), document))
        .filter(Boolean),
      report: buildPatientReportResponse(report.toObject()),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload patient report documents";
    return res.status(500).json({ error: message });
  }
}

export async function downloadPatientReportDocumentController(req, res) {
  try {
    const access = await ensurePatientReportAccess({ req, allowDoctor: true });
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const reportId = normalizeString(req?.params?.reportId);
    const documentId = normalizeString(req?.params?.documentId);
    if (!reportId) return res.status(400).json({ error: "reportId is required" });
    if (!documentId) return res.status(400).json({ error: "documentId is required" });

    const report = await findPatientReport({ patientId: access.patientId, reportId, lean: true });
    if (!report?._id) return res.status(404).json({ error: "Patient report not found" });

    const document = normalizeArray(report.uploadedDocuments).find((item) => item?._id?.toString?.() === documentId);
    if (!document?._id) return res.status(404).json({ error: "Document not found" });

    const relativePath = normalizeString(document.relativePath);
    if (!relativePath) return res.status(404).json({ error: "Document file not found" });

    const absolutePath = path.join(REPORT_DOCUMENTS_DIR, relativePath);
    const fileBuffer = await fs.readFile(absolutePath);

    res.setHeader("Content-Type", normalizeString(document.mimeType) || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${sanitizeFileNamePart(document.originalName || "document")}"`,
    );
    res.setHeader("Content-Length", String(fileBuffer.length));
    return res.send(fileBuffer);
  } catch (err) {
    if (err?.code === "ENOENT") {
      return res.status(404).json({ error: "Document file not found" });
    }
    const message = err instanceof Error ? err.message : "Failed to download patient report document";
    return res.status(500).json({ error: message });
  }
}

export async function deletePatientReportDocumentController(req, res) {
  try {
    const access = await ensurePatientReportAccess({ req, allowDoctor: false });
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const reportId = normalizeString(req?.params?.reportId);
    const documentId = normalizeString(req?.params?.documentId);
    if (!reportId) return res.status(400).json({ error: "reportId is required" });
    if (!documentId) return res.status(400).json({ error: "documentId is required" });

    const report = await findPatientReport({ patientId: access.patientId, reportId, lean: false });
    if (!report?._id) return res.status(404).json({ error: "Patient report not found" });

    const document = report.uploadedDocuments.id(documentId);
    if (!document?._id) return res.status(404).json({ error: "Document not found" });

    const deletedDocument = toDocumentResponse(access.patientId, report._id.toString(), document);
    const relativePath = normalizeString(document.relativePath);
    if (relativePath) {
      const absolutePath = path.join(REPORT_DOCUMENTS_DIR, relativePath);
      try {
        await fs.unlink(absolutePath);
      } catch (err) {
        if (err?.code !== "ENOENT") {
          throw err;
        }
      }
    }

    document.deleteOne();
    report.lastSavedAt = new Date();
    report.updatedBy = access.actorId;
    await report.save();

    return res.json({
      message: "Report document deleted successfully",
      deletedDocument,
      report: buildPatientReportResponse(report.toObject()),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete patient report document";
    return res.status(500).json({ error: message });
  }
}
