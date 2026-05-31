import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { PatientDocument, PATIENT_DOCUMENT_CATEGORIES } from "../Models/PatientDocument.js";
import { PatientReport } from "../Models/PatientReport.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { Notification } from "../Models/Notification.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, "..", "..", "uploads", "patient-documents");

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export async function listPatientDocumentsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { category, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = { patient: patientId };
    if (category && PATIENT_DOCUMENT_CATEGORIES.includes(category)) {
      query.category = category;
    }

    const [documents, total] = await Promise.all([
      PatientDocument.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PatientDocument.countDocuments(query)
    ]);

    return res.json({
      documents: documents.map((doc) => ({
        id: doc._id.toString(),
        category: doc.category,
        description: doc.description || "",
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        status: doc.status,
        reviewedAt: doc.reviewedAt,
        createdAt: doc.createdAt
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    console.error("listPatientDocumentsController error:", err);
    return res.status(500).json({ error: "Failed to load documents" });
  }
}

export async function uploadDocumentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const { category, description } = req.body;
    if (!category || !PATIENT_DOCUMENT_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: "Valid category is required" });
    }

    ensureUploadsDir();

    const savedDocs = [];

    for (const file of files) {
      const ext = path.extname(file.originalname) || "";
      const storedName = `${patientId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
      const filePath = path.join(UPLOADS_DIR, storedName);
      const relativePath = path.relative(path.resolve(__dirname, "..", ".."), filePath);

      fs.writeFileSync(filePath, file.buffer);

      const doc = await PatientDocument.create({
        patient: patientId,
        category,
        description: (description || "").trim(),
        originalName: file.originalname,
        storedName,
        relativePath,
        mimeType: file.mimetype,
        size: file.size
      });

      savedDocs.push({
        id: doc._id.toString(),
        category: doc.category,
        originalName: doc.originalName,
        size: doc.size,
        status: doc.status,
        createdAt: doc.createdAt
      });
    }

    // Notify assigned nurse
    const profile = await PatientProfile.findOne({ user: patientId }).lean();
    const assignedNurse = profile?.assignedNurses?.[0] || null;
    if (assignedNurse) {
      await Notification.create({
        user: assignedNurse,
        type: "document_uploaded",
        title: "Patient Uploaded Document",
        message: `Patient ${req.user.name || ""} uploaded ${savedDocs.length} document(s) (${category.replace(/_/g, " ")})`,
        metadata: { patientId, documentIds: savedDocs.map((d) => d.id) },
        createdBy: patientId
      });
    }

    return res.status(201).json({
      success: true,
      message: `${savedDocs.length} document(s) uploaded successfully`,
      documents: savedDocs
    });
  } catch (err) {
    console.error("uploadDocumentController error:", err);
    return res.status(500).json({ error: "Failed to upload document" });
  }
}

export async function deleteDocumentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    const doc = await PatientDocument.findOne({ _id: id, patient: patientId });
    if (!doc) return res.status(404).json({ error: "Document not found" });

    if (doc.status === "reviewed") {
      return res.status(400).json({ error: "Cannot delete a document that has already been reviewed" });
    }

    // Delete file from disk
    const filePath = path.resolve(__dirname, "..", "..", doc.relativePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await PatientDocument.deleteOne({ _id: id });

    return res.json({ success: true, message: "Document deleted" });
  } catch (err) {
    console.error("deleteDocumentController error:", err);
    return res.status(500).json({ error: "Failed to delete document" });
  }
}

export async function downloadDocumentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    const doc = await PatientDocument.findOne({ _id: id, patient: patientId }).lean();
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const filePath = path.resolve(__dirname, "..", "..", doc.relativePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on server" });
    }

    res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${doc.originalName}"`);
    return fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("downloadDocumentController error:", err);
    return res.status(500).json({ error: "Failed to download document" });
  }
}

/**
 * GET /api/patient/documents/by-report
 * Returns all documents grouped by the report they were uploaded in (folder structure)
 */
export async function listDocumentsByReportController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    // Get all reports with their uploaded documents
    const reports = await PatientReport.find(
      { patient: patientId, "uploadedDocuments.0": { $exists: true } },
      { reportNumber: 1, createdAt: 1, uploadedDocuments: 1, assignedDoctor: 1 }
    )
      .populate("assignedDoctor", "name")
      .sort({ createdAt: -1 })
      .lean();

    const folders = reports.map((report) => ({
      reportId: report._id.toString(),
      reportNumber: report.reportNumber,
      reportDate: report.createdAt,
      doctor: report.assignedDoctor ? { id: report.assignedDoctor._id.toString(), name: report.assignedDoctor.name } : null,
      documents: (report.uploadedDocuments || []).map((doc) => ({
        id: doc._id.toString(),
        stepId: doc.stepId,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        uploadedAt: doc.uploadedAt,
      })),
    }));

    return res.json({ folders });
  } catch (err) {
    console.error("listDocumentsByReportController error:", err);
    return res.status(500).json({ error: "Failed to load documents" });
  }
}
