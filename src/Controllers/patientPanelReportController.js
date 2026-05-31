import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PatientReport } from "../Models/PatientReport.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildReportListItem(report) {
  if (!report?._id) return null;
  return {
    id: report._id.toString(),
    reportNumber: report.reportNumber,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    doctor: report.assignedDoctor
      ? { id: report.assignedDoctor._id.toString(), name: report.assignedDoctor.name }
      : null,
    nurse: report.assignedNurse
      ? { id: report.assignedNurse._id.toString(), name: report.assignedNurse.name }
      : null,
    documentsCount: report.uploadedDocuments?.length || 0,
    lastSavedAt: report.lastSavedAt || null
  };
}

export async function listPatientReportsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = { patient: patientId };

    const [reports, total] = await Promise.all([
      PatientReport.find(query)
        .select("reportNumber createdAt updatedAt assignedDoctor assignedNurse uploadedDocuments lastSavedAt")
        .populate("assignedDoctor", "name")
        .populate("assignedNurse", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PatientReport.countDocuments(query)
    ]);

    return res.json({
      reports: reports.map(buildReportListItem).filter(Boolean),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    console.error("listPatientReportsController error:", err);
    return res.status(500).json({ error: "Failed to load reports" });
  }
}

export async function getPatientReportDetailController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { reportId } = req.params;

    const report = await PatientReport.findOne({ _id: reportId, patient: patientId })
      .populate("assignedDoctor", "name email phone")
      .populate("assignedNurse", "name email phone")
      .lean();

    if (!report) return res.status(404).json({ error: "Report not found" });

    return res.json({
      id: report._id.toString(),
      reportNumber: report.reportNumber,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      lastSavedAt: report.lastSavedAt || null,
      doctor: report.assignedDoctor
        ? { id: report.assignedDoctor._id.toString(), name: report.assignedDoctor.name, email: report.assignedDoctor.email }
        : null,
      nurse: report.assignedNurse
        ? { id: report.assignedNurse._id.toString(), name: report.assignedNurse.name }
        : null,
      generatedReport: report.generatedReport || null,
      reportValues: report.reportValues || null,
      documents: (report.uploadedDocuments || []).map((doc) => ({
        id: doc._id.toString(),
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        uploadedAt: doc.uploadedAt
      }))
    });
  } catch (err) {
    console.error("getPatientReportDetailController error:", err);
    return res.status(500).json({ error: "Failed to load report" });
  }
}

export async function downloadPatientReportDocController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { reportId, docId } = req.params;

    const report = await PatientReport.findOne({ _id: reportId, patient: patientId })
      .select("uploadedDocuments")
      .lean();

    if (!report) return res.status(404).json({ error: "Report not found" });

    const doc = (report.uploadedDocuments || []).find(
      (d) => d._id.toString() === docId
    );
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const filePath = path.resolve(__dirname, "..", "..", doc.relativePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on server" });
    }

    res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${doc.originalName}"`);
    return fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("downloadPatientReportDocController error:", err);
    return res.status(500).json({ error: "Failed to download document" });
  }
}
