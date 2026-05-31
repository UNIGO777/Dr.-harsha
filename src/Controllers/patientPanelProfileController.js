import { User } from "../Models/User.js";
import { PatientProfile } from "../Models/PatientProfile.js";

export async function getPatientProfileController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const [user, profile] = await Promise.all([
      User.findById(patientId).select("name email phone gender status userNumber createdAt").lean(),
      PatientProfile.findOne({ user: patientId })
        .populate("assignedDoctors", "name email phone userNumber")
        .populate("assignedNurses", "name email phone userNumber")
        .lean()
    ]);

    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json({
      personal: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        gender: user.gender || "",
        userNumber: user.userNumber ?? null,
        memberSince: user.createdAt
      },
      profile: {
        age: profile?.age ?? null,
        address: profile?.address || "",
        secondaryPhone: profile?.secondaryPhone || "",
        reference: profile?.reference || "",
        services: profile?.services || [],
        tags: profile?.tags || [],
        priority: profile?.priority || "medium",
        emergencyContact: profile?.emergencyContact || null,
        bloodGroup: profile?.bloodGroup || "",
        allergies: profile?.allergies || [],
        existingConditions: profile?.existingConditions || [],
        notificationPreferences: profile?.notificationPreferences || {
          emailNotifications: true,
          smsNotifications: false,
          appointmentReminders: true,
          reportAlerts: true,
          medicationReminders: true
        }
      },
      careTeam: {
        doctors: (profile?.assignedDoctors || []).map((d) => ({
          id: d._id.toString(),
          name: d.name,
          email: d.email,
          phone: d.phone || ""
        })),
        nurses: (profile?.assignedNurses || []).map((n) => ({
          id: n._id.toString(),
          name: n.name,
          email: n.email,
          phone: n.phone || ""
        }))
      },
      dates: {
        lastInteractionAt: profile?.lastInteractionAt || null,
        nextAppointmentAt: profile?.nextAppointmentAt || null,
        followUpDueAt: profile?.followUpDueAt || null
      }
    });
  } catch (err) {
    console.error("getPatientProfileController error:", err);
    return res.status(500).json({ error: "Failed to load profile" });
  }
}

export async function updatePatientProfileController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const {
      phone,
      address,
      secondaryPhone,
      emergencyContact,
      bloodGroup,
      allergies,
      existingConditions
    } = req.body;

    const profileUpdate = {};
    const userUpdate = {};

    if (typeof phone === "string" && phone.trim()) {
      userUpdate.phone = phone.trim();
    }

    if (typeof address === "string") {
      profileUpdate.address = address.trim();
    }

    if (typeof secondaryPhone === "string") {
      profileUpdate.secondaryPhone = secondaryPhone.trim();
    }

    if (emergencyContact && typeof emergencyContact === "object") {
      profileUpdate.emergencyContact = {
        name: typeof emergencyContact.name === "string" ? emergencyContact.name.trim() : "",
        relation: typeof emergencyContact.relation === "string" ? emergencyContact.relation.trim() : "",
        phone: typeof emergencyContact.phone === "string" ? emergencyContact.phone.trim() : ""
      };
    }

    const validBloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", ""];
    if (typeof bloodGroup === "string" && validBloodGroups.includes(bloodGroup)) {
      profileUpdate.bloodGroup = bloodGroup;
    }

    if (Array.isArray(allergies)) {
      profileUpdate.allergies = allergies
        .filter((a) => typeof a === "string" && a.trim())
        .map((a) => a.trim());
    }

    if (Array.isArray(existingConditions)) {
      profileUpdate.existingConditions = existingConditions
        .filter((c) => typeof c === "string" && c.trim())
        .map((c) => c.trim());
    }

    const updates = [];

    if (Object.keys(userUpdate).length > 0) {
      updates.push(User.findByIdAndUpdate(patientId, userUpdate, { new: true }).lean());
    }

    if (Object.keys(profileUpdate).length > 0) {
      updates.push(
        PatientProfile.findOneAndUpdate(
          { user: patientId },
          { $set: profileUpdate },
          { new: true, upsert: true }
        ).lean()
      );
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await Promise.all(updates);

    return res.json({ success: true, message: "Profile updated successfully" });
  } catch (err) {
    console.error("updatePatientProfileController error:", err);
    return res.status(500).json({ error: "Failed to update profile" });
  }
}

export async function updateNotificationPrefsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const {
      emailNotifications,
      smsNotifications,
      appointmentReminders,
      reportAlerts,
      medicationReminders
    } = req.body;

    const prefs = {};
    if (typeof emailNotifications === "boolean") prefs["notificationPreferences.emailNotifications"] = emailNotifications;
    if (typeof smsNotifications === "boolean") prefs["notificationPreferences.smsNotifications"] = smsNotifications;
    if (typeof appointmentReminders === "boolean") prefs["notificationPreferences.appointmentReminders"] = appointmentReminders;
    if (typeof reportAlerts === "boolean") prefs["notificationPreferences.reportAlerts"] = reportAlerts;
    if (typeof medicationReminders === "boolean") prefs["notificationPreferences.medicationReminders"] = medicationReminders;

    if (Object.keys(prefs).length === 0) {
      return res.status(400).json({ error: "No valid preferences provided" });
    }

    await PatientProfile.findOneAndUpdate(
      { user: patientId },
      { $set: prefs },
      { upsert: true }
    );

    return res.json({ success: true, message: "Notification preferences updated" });
  } catch (err) {
    console.error("updateNotificationPrefsController error:", err);
    return res.status(500).json({ error: "Failed to update preferences" });
  }
}
