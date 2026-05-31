import { PatientProfile } from "../Models/PatientProfile.js";

function buildMedicationResponse(med) {
  if (!med?._id) return null;
  return {
    id: med._id.toString(),
    medicineName: med.medicineName,
    durationValue: med.durationValue,
    durationUnit: med.durationUnit,
    timeSlots: med.timeSlots || [],
    foodTiming: med.foodTiming,
    additionalInfo: med.additionalInfo || "",
    doctor: med.doctor
      ? { id: med.doctor._id?.toString?.() || med.doctor.toString(), name: med.doctor.name || "" }
      : null,
    addedBy: med.addedBy
      ? { id: med.addedBy._id?.toString?.() || med.addedBy.toString(), name: med.addedBy.name || "" }
      : null,
    createdAt: med.createdAt,
    updatedAt: med.updatedAt
  };
}

export async function listPatientMedicationsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const profile = await PatientProfile.findOne({ user: patientId })
      .populate("medications.doctor", "name email")
      .populate("medications.addedBy", "name")
      .lean();

    if (!profile) return res.status(404).json({ error: "Patient profile not found" });

    const medications = (profile.medications || []).map(buildMedicationResponse).filter(Boolean);

    return res.json({ medications });
  } catch (err) {
    console.error("listPatientMedicationsController error:", err);
    return res.status(500).json({ error: "Failed to load medications" });
  }
}
