import { User } from "../Models/User.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { NurseProfile } from "../Models/NurseProfile.js";

function buildUserOption(user) {
  if (!user?._id) return null;
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    status: user.status,
    userNumber: user.userNumber ?? null
  };
}

export async function getAdminAssignmentsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const userId = req?.user?._id?.toString?.() || "";
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { doctorId } = req.query;

    // Doctors with patient counts
    const doctorPatientCounts = await PatientProfile.aggregate([
      { $unwind: "$assignedDoctors" },
      { $group: { _id: "$assignedDoctors", patientCount: { $sum: 1 } } }
    ]);

    const doctorIds = doctorPatientCounts.map((d) => d._id).filter(Boolean);
    const allDoctors = await User.find({ role: "doctor", status: "active" })
      .select("name email phone status userNumber")
      .lean();

    const countMap = new Map(doctorPatientCounts.map((d) => [d._id.toString(), d.patientCount]));

    const doctors = allDoctors.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      email: d.email,
      phone: d.phone || "",
      userNumber: d.userNumber ?? null,
      patientCount: countMap.get(d._id.toString()) || 0
    })).sort((a, b) => b.patientCount - a.patientCount);

    // Orphaned patients (no doctors assigned)
    const orphanedProfiles = await PatientProfile.find({
      $or: [
        { assignedDoctors: { $size: 0 } },
        { assignedDoctors: { $exists: false } }
      ]
    })
      .populate("user", "name email phone status userNumber")
      .select("user priority services tags")
      .lean();

    const orphanedPatients = orphanedProfiles
      .filter((p) => p.user)
      .map((p) => ({
        profileId: p._id.toString(),
        patient: buildUserOption(p.user),
        priority: p.priority || "medium",
        services: p.services || [],
        tags: p.tags || []
      }));

    // Nurse-doctor assignments
    const nurseAssignments = await NurseProfile.find({})
      .populate("user", "name email phone status userNumber")
      .populate("assignedDoctor", "name email phone status userNumber")
      .lean();

    const nurseAssignmentList = nurseAssignments
      .filter((n) => n.user)
      .map((n) => ({
        nurse: buildUserOption(n.user),
        assignedDoctor: n.assignedDoctor ? buildUserOption(n.assignedDoctor) : null
      }));

    // If a specific doctor is selected, fetch their patients
    let doctorPatients = [];
    if (doctorId) {
      const profiles = await PatientProfile.find({ assignedDoctors: doctorId })
        .populate("user", "name email phone status userNumber")
        .select("user priority services tags assignedDoctors assignedNurses")
        .lean();

      doctorPatients = profiles
        .filter((p) => p.user)
        .map((p) => ({
          profileId: p._id.toString(),
          patient: buildUserOption(p.user),
          priority: p.priority || "medium",
          services: p.services || [],
          tags: p.tags || [],
          doctorCount: (p.assignedDoctors || []).length,
          nurseCount: (p.assignedNurses || []).length
        }));
    }

    return res.json({
      doctors,
      orphanedPatients,
      nurseAssignments: nurseAssignmentList,
      doctorPatients,
      selectedDoctorId: doctorId || null
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to load assignments";
    return res.status(statusCode).json({ error: message });
  }
}

export async function updateAdminPatientAssignmentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const userId = req?.user?._id?.toString?.() || "";
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { patientProfileId, addDoctors, removeDoctors } = req.body || {};

    if (!patientProfileId) {
      return res.status(400).json({ error: "Missing patientProfileId" });
    }

    const profile = await PatientProfile.findById(patientProfileId);
    if (!profile) {
      return res.status(404).json({ error: "Patient profile not found" });
    }

    if (Array.isArray(addDoctors) && addDoctors.length > 0) {
      await PatientProfile.updateOne(
        { _id: patientProfileId },
        { $addToSet: { assignedDoctors: { $each: addDoctors } } }
      );
    }

    if (Array.isArray(removeDoctors) && removeDoctors.length > 0) {
      await PatientProfile.updateOne(
        { _id: patientProfileId },
        { $pull: { assignedDoctors: { $in: removeDoctors } } }
      );
    }

    const updated = await PatientProfile.findById(patientProfileId)
      .populate("user", "name email phone status userNumber")
      .populate("assignedDoctors", "name email phone status userNumber")
      .lean();

    return res.json({
      success: true,
      message: "Patient assignment updated",
      profile: {
        profileId: updated._id.toString(),
        patient: buildUserOption(updated.user),
        assignedDoctors: (updated.assignedDoctors || []).map(buildUserOption).filter(Boolean)
      }
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to update assignment";
    return res.status(statusCode).json({ error: message });
  }
}
