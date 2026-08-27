import mongoose from "mongoose";
import { PreConsultationNote } from "../Models/PreConsultationNote.js";
import { Appointment } from "../Models/Appointment.js";

function normalizeString(value, maxLength = 1000) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, maxLength);
}

function normalizeVitals(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    bloodPressure: normalizeString(source.bloodPressure, 20),
    pulse: normalizeString(source.pulse, 20),
    temperature: normalizeString(source.temperature, 20),
    spo2: normalizeString(source.spo2, 20),
    weightKg: normalizeString(source.weightKg, 20),
    heightCm: normalizeString(source.heightCm, 20),
    bloodSugar: normalizeString(source.bloodSugar, 30)
  };
}

function buildNoteResponse(note) {
  // note.appointment may be a bare ObjectId or a populated document
  const rawAppointment = note.appointment;
  const appointmentId = rawAppointment?._id ? rawAppointment._id.toString() : rawAppointment ? String(rawAppointment) : "";
  return {
    id: note._id.toString(),
    appointmentId,
    patient: note.patient?._id ? { id: note.patient._id.toString(), name: note.patient.name || "" } : null,
    nurse: note.nurse?._id ? { id: note.nurse._id.toString(), name: note.nurse.name || "" } : null,
    chiefComplaint: note.chiefComplaint || "",
    vitals: {
      bloodPressure: note.vitals?.bloodPressure || "",
      pulse: note.vitals?.pulse || "",
      temperature: note.vitals?.temperature || "",
      spo2: note.vitals?.spo2 || "",
      weightKg: note.vitals?.weightKg || "",
      heightCm: note.vitals?.heightCm || "",
      bloodSugar: note.vitals?.bloodSugar || ""
    },
    currentMedications: note.currentMedications || "",
    observations: note.observations || "",
    redFlags: note.redFlags || "",
    documentsSummary: note.documentsSummary || "",
    status: note.status,
    submittedAt: note.submittedAt || null,
    acknowledgedBy: note.acknowledgedBy?._id
      ? { id: note.acknowledgedBy._id.toString(), name: note.acknowledgedBy.name || "" }
      : null,
    acknowledgedAt: note.acknowledgedAt || null,
    updatedAt: note.updatedAt
  };
}

export async function getPreConsultationNoteController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const appointmentId = normalizeString(req?.params?.appointmentId, 50);
    if (!mongoose.isValidObjectId(appointmentId)) return res.status(400).json({ error: "Invalid appointmentId" });

    const note = await PreConsultationNote.findOne({ appointment: appointmentId })
      .populate("patient", "name")
      .populate("nurse", "name")
      .populate("acknowledgedBy", "name")
      .lean();

    if (!note) return res.json({ note: null });

    // A draft is the nurse's scratchpad — doctors only see it once submitted
    const role = req?.user?.role || "";
    if (role === "doctor" && note.status === "draft") return res.json({ note: null });

    return res.json({ note: buildNoteResponse(note) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load note" });
  }
}

/** Nurse creates or updates the handover note; body.submit sends it to the doctor. */
export async function upsertPreConsultationNoteController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const appointmentId = normalizeString(req?.params?.appointmentId, 50);
    if (!mongoose.isValidObjectId(appointmentId)) return res.status(400).json({ error: "Invalid appointmentId" });

    const appointment = await Appointment.findById(appointmentId).select("patient doctor status").lean();
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });
    if (["cancelled", "no_show"].includes(appointment.status)) {
      return res.status(409).json({ error: `Cannot add a pre-consultation note to a ${appointment.status.replace("_", "-")} appointment` });
    }

    const nurseId = req?.user?._id;
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    let note = await PreConsultationNote.findOne({ appointment: appointmentId });
    if (note && note.status === "acknowledged") {
      return res.status(409).json({ error: "The doctor has already acknowledged this note" });
    }

    const body = req?.body || {};
    const submit = body.submit === true;

    if (!note) {
      note = new PreConsultationNote({
        appointment: appointment._id,
        patient: appointment.patient,
        doctor: appointment.doctor,
        nurse: nurseId
      });
    } else {
      note.nurse = nurseId;
    }

    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
    if (has("chiefComplaint")) note.chiefComplaint = normalizeString(body.chiefComplaint);
    if (has("vitals")) note.vitals = normalizeVitals(body.vitals);
    if (has("currentMedications")) note.currentMedications = normalizeString(body.currentMedications);
    if (has("observations")) note.observations = normalizeString(body.observations, 2000);
    if (has("redFlags")) note.redFlags = normalizeString(body.redFlags);
    if (has("documentsSummary")) note.documentsSummary = normalizeString(body.documentsSummary);

    if (submit && note.status === "draft") {
      note.status = "submitted";
      note.submittedAt = new Date();
    }

    await note.save();
    const populated = await PreConsultationNote.findById(note._id)
      .populate("patient", "name")
      .populate("nurse", "name")
      .populate("acknowledgedBy", "name")
      .lean();

    return res.json({
      message: submit ? "Pre-consultation note submitted to the doctor." : "Pre-consultation note saved.",
      note: buildNoteResponse(populated)
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to save note" });
  }
}

export async function acknowledgePreConsultationNoteController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const appointmentId = normalizeString(req?.params?.appointmentId, 50);
    if (!mongoose.isValidObjectId(appointmentId)) return res.status(400).json({ error: "Invalid appointmentId" });

    const note = await PreConsultationNote.findOne({ appointment: appointmentId });
    if (!note) return res.status(404).json({ error: "No pre-consultation note for this appointment" });
    if (note.status === "draft") return res.status(409).json({ error: "Note has not been submitted yet" });
    if (note.status === "acknowledged") return res.status(409).json({ error: "Note is already acknowledged" });

    note.status = "acknowledged";
    note.acknowledgedBy = req?.user?._id || null;
    note.acknowledgedAt = new Date();
    await note.save();

    return res.json({ message: "Note acknowledged." });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to acknowledge note" });
  }
}

/** Doctor's queue: submitted notes for their appointments (today first). */
export async function listDoctorPreConsultationNotesController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const doctorId = req?.user?._id;
    if (!doctorId) return res.status(401).json({ error: "Unauthorized" });

    const notes = await PreConsultationNote.find({ doctor: doctorId, status: "submitted" })
      .populate("patient", "name userNumber")
      .populate("nurse", "name")
      .populate({ path: "appointment", select: "scheduledAt reason status" })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    return res.json({
      notes: notes.map((note) => ({
        ...buildNoteResponse(note),
        appointment: note.appointment?._id
          ? {
              id: note.appointment._id.toString(),
              scheduledAt: note.appointment.scheduledAt,
              reason: note.appointment.reason || "",
              status: note.appointment.status
            }
          : null
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list notes" });
  }
}
