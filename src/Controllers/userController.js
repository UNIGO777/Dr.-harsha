import { User, USER_ROLES_ENUM, USER_STATUSES_ENUM } from "../Models/User.js";
import { DoctorProfile } from "../Models/DoctorProfile.js";
import { NurseProfile } from "../Models/NurseProfile.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { canCreateUser } from "../utils/permissions.js";

export async function createUserController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const creator = req.user;
    const creatorRole = typeof creator?.role === "string" ? creator.role : "";

    const name = typeof req?.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req?.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req?.body?.password === "string" ? req.body.password : "";
    const role = typeof req?.body?.role === "string" ? req.body.role.trim() : "";
    const phone = typeof req?.body?.phone === "string" ? req.body.phone.trim() : "";
    const status = typeof req?.body?.status === "string" ? req.body.status.trim() : "active";

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password, role are required" });
    }
    if (!USER_ROLES_ENUM.includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (!USER_STATUSES_ENUM.includes(status)) return res.status(400).json({ error: "Invalid status" });

    if (!canCreateUser(creatorRole, role)) {
      return res.status(403).json({ error: "Permission denied" });
    }

    const exists = await User.findOne({ email }).lean();
    if (exists) return res.status(409).json({ error: "Email already exists" });

    const user = await User.create({ name, email, password, role, phone, status });

    const createdBy = creator?._id || null;
    if (role === "doctor") await DoctorProfile.create({ user: user._id, createdBy });
    if (role === "nurse") await NurseProfile.create({ user: user._id, createdBy });
    if (role === "patient") await PatientProfile.create({ user: user._id, createdBy });

    return res.status(201).json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create user";
    return res.status(500).json({ error: message });
  }
}
