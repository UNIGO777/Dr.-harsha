import mongoose from "mongoose";
import { Lead, LEAD_STAGE_ENUM } from "../Models/Lead.js";
import { User } from "../Models/User.js";
import { PATIENT_DISCOVERY_SOURCE_OPTIONS } from "../Models/patientIntakeOptions.js";

const CONTACTED_STAGES = ["contacted", "interested", "booked", "converted"];
// A "new" lead older than this counts as "not called yet" on the dashboard
export const LEAD_UNCONTACTED_ALERT_HOURS = 24;

function normalizeString(value, maxLength = 300) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, maxLength);
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildLeadResponse(lead) {
  return {
    id: lead._id.toString(),
    name: lead.name,
    phone: lead.phone || "",
    email: lead.email || "",
    city: lead.city || "",
    source: lead.source || "",
    sourceDetail: lead.sourceDetail || "",
    interestedIn: lead.interestedIn || "",
    stage: lead.stage,
    firstContactedAt: lead.firstContactedAt || null,
    lastContactedAt: lead.lastContactedAt || null,
    nextFollowUpAt: lead.nextFollowUpAt || null,
    assignedTo: lead.assignedTo?._id
      ? { id: lead.assignedTo._id.toString(), name: lead.assignedTo.name || "" }
      : null,
    convertedPatient: lead.convertedPatient?._id
      ? {
          id: lead.convertedPatient._id.toString(),
          name: lead.convertedPatient.name || "",
          userNumber: lead.convertedPatient.userNumber ?? null
        }
      : null,
    convertedAt: lead.convertedAt || null,
    lostReason: lead.lostReason || "",
    notes: Array.isArray(lead.notes)
      ? lead.notes.map((note) => ({
          id: note._id?.toString?.() || "",
          content: note.content,
          createdAt: note.createdAt,
          createdBy: note.createdBy?._id
            ? { id: note.createdBy._id.toString(), name: note.createdBy.name || "" }
            : null
        }))
      : [],
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt
  };
}

export async function listLeadsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const stage = normalizeString(req?.query?.stage);
    const source = normalizeString(req?.query?.source);
    const search = normalizeString(req?.query?.search);
    const uncontactedOnly = req?.query?.uncontacted === "true";
    const page = Math.max(1, parseInt(req?.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req?.query?.limit, 10) || 25));

    const query = {};
    if (stage && LEAD_STAGE_ENUM.includes(stage)) query.stage = stage;
    if (source && PATIENT_DISCOVERY_SOURCE_OPTIONS.includes(source)) query.source = source;
    if (uncontactedOnly) {
      query.stage = "new";
      query.createdAt = { $lt: new Date(Date.now() - LEAD_UNCONTACTED_ALERT_HOURS * 60 * 60 * 1000) };
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }

    const [leads, total, stageCountsRaw] = await Promise.all([
      Lead.find(query)
        .populate("assignedTo", "name")
        .populate("convertedPatient", "name userNumber")
        .populate("notes.createdBy", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Lead.countDocuments(query),
      Lead.aggregate([{ $group: { _id: "$stage", count: { $sum: 1 } } }])
    ]);

    const stageCounts = Object.fromEntries(LEAD_STAGE_ENUM.map((value) => [value, 0]));
    for (const row of stageCountsRaw) {
      if (row._id in stageCounts) stageCounts[row._id] = row.count;
    }

    const uncontactedCount = await Lead.countDocuments({
      stage: "new",
      createdAt: { $lt: new Date(Date.now() - LEAD_UNCONTACTED_ALERT_HOURS * 60 * 60 * 1000) }
    });

    return res.json({
      leads: leads.map(buildLeadResponse),
      total,
      page,
      limit,
      stageCounts,
      uncontactedCount
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list leads" });
  }
}

export async function createLeadController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const name = normalizeString(req?.body?.name, 200);
    if (!name) return res.status(400).json({ error: "name is required" });

    const source = normalizeString(req?.body?.source, 100);
    if (source && !PATIENT_DISCOVERY_SOURCE_OPTIONS.includes(source)) {
      return res.status(400).json({ error: "Invalid source" });
    }

    const lead = await Lead.create({
      name,
      phone: normalizeString(req?.body?.phone, 30),
      email: normalizeString(req?.body?.email, 200).toLowerCase(),
      city: normalizeString(req?.body?.city, 100),
      source,
      sourceDetail: normalizeString(req?.body?.sourceDetail),
      interestedIn: normalizeString(req?.body?.interestedIn),
      nextFollowUpAt: normalizeDate(req?.body?.nextFollowUpAt),
      assignedTo: mongoose.isValidObjectId(req?.body?.assignedTo) ? req.body.assignedTo : null,
      createdBy: req?.user?._id || null,
      stageHistory: [{ stage: "new", at: new Date(), by: req?.user?._id || null }]
    });

    return res.status(201).json({ message: "Lead created.", lead: buildLeadResponse(lead.toObject()) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create lead" });
  }
}

export async function updateLeadController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const leadId = normalizeString(req?.params?.leadId, 50);
    if (!mongoose.isValidObjectId(leadId)) return res.status(400).json({ error: "Invalid leadId" });

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const body = req?.body || {};
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
    const actorId = req?.user?._id || null;
    const now = new Date();

    if (has("name")) {
      const name = normalizeString(body.name, 200);
      if (!name) return res.status(400).json({ error: "name cannot be empty" });
      lead.name = name;
    }
    if (has("phone")) lead.phone = normalizeString(body.phone, 30);
    if (has("email")) lead.email = normalizeString(body.email, 200).toLowerCase();
    if (has("city")) lead.city = normalizeString(body.city, 100);
    if (has("sourceDetail")) lead.sourceDetail = normalizeString(body.sourceDetail);
    if (has("interestedIn")) lead.interestedIn = normalizeString(body.interestedIn);
    if (has("nextFollowUpAt")) lead.nextFollowUpAt = normalizeDate(body.nextFollowUpAt);
    if (has("assignedTo")) {
      lead.assignedTo = mongoose.isValidObjectId(body.assignedTo) ? body.assignedTo : null;
    }
    if (has("source")) {
      const source = normalizeString(body.source, 100);
      if (source && !PATIENT_DISCOVERY_SOURCE_OPTIONS.includes(source)) {
        return res.status(400).json({ error: "Invalid source" });
      }
      lead.source = source;
    }

    if (has("stage")) {
      const stage = normalizeString(body.stage, 50);
      if (!LEAD_STAGE_ENUM.includes(stage)) return res.status(400).json({ error: "Invalid stage" });
      if (stage !== lead.stage) {
        lead.stage = stage;
        lead.stageHistory.push({ stage, at: now, by: actorId, note: normalizeString(body.stageNote) });
        if (CONTACTED_STAGES.includes(stage)) {
          if (!lead.firstContactedAt) lead.firstContactedAt = now;
          lead.lastContactedAt = now;
        }
        if (stage === "lost") lead.lostReason = normalizeString(body.lostReason);
      }
    }

    // Log a call attempt without moving the stage
    if (body.markContacted === true) {
      if (!lead.firstContactedAt) lead.firstContactedAt = now;
      lead.lastContactedAt = now;
      if (lead.stage === "new") {
        lead.stage = "contacted";
        lead.stageHistory.push({ stage: "contacted", at: now, by: actorId });
      }
    }

    if (has("note")) {
      const content = normalizeString(body.note, 1000);
      if (content && actorId) lead.notes.push({ content, createdBy: actorId, createdAt: now });
    }

    await lead.save();
    const populated = await Lead.findById(lead._id)
      .populate("assignedTo", "name")
      .populate("convertedPatient", "name userNumber")
      .populate("notes.createdBy", "name")
      .lean();

    return res.json({ message: "Lead updated.", lead: buildLeadResponse(populated) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update lead" });
  }
}

/** Link a lead to the patient account created for them. */
export async function convertLeadController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const leadId = normalizeString(req?.params?.leadId, 50);
    const patientId = normalizeString(req?.body?.patientId, 50);
    if (!mongoose.isValidObjectId(leadId)) return res.status(400).json({ error: "Invalid leadId" });
    if (!mongoose.isValidObjectId(patientId)) return res.status(400).json({ error: "patientId is required" });

    const [lead, patient] = await Promise.all([
      Lead.findById(leadId),
      User.findOne({ _id: patientId, role: "patient" }).select("name userNumber").lean()
    ]);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    if (lead.stage === "converted") return res.status(409).json({ error: "Lead is already converted" });

    const now = new Date();
    lead.stage = "converted";
    lead.convertedPatient = patient._id;
    lead.convertedAt = now;
    if (!lead.firstContactedAt) lead.firstContactedAt = now;
    lead.lastContactedAt = now;
    lead.stageHistory.push({ stage: "converted", at: now, by: req?.user?._id || null });
    await lead.save();

    return res.json({
      message: `Lead converted to patient ${patient.name}.`,
      lead: buildLeadResponse({ ...lead.toObject(), convertedPatient: patient })
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to convert lead" });
  }
}
