import { User, USER_ROLES_ENUM, USER_STATUSES_ENUM } from "../Models/User.js";
import { DoctorProfile } from "../Models/DoctorProfile.js";
import { NurseProfile } from "../Models/NurseProfile.js";
import { PatientProfile } from "../Models/PatientProfile.js";
import { canCreateUser } from "../utils/permissions.js";

function buildUserResponse(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || null
  };
}

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
      user: buildUserResponse(user)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create user";
    return res.status(500).json({ error: message });
  }
}

export async function listUsersController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const requestedRole = typeof req?.query?.role === "string" ? req.query.role.trim() : "";
    const search = typeof req?.query?.search === "string" ? req.query.search.trim() : "";

    if (requestedRole && !USER_ROLES_ENUM.includes(requestedRole)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const query = {};
    if (requestedRole) query.role = requestedRole;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];
    }

    const users = await User.find(query).sort({ createdAt: -1 }).lean();

    return res.json({
      users: users.map((user) => buildUserResponse(user))
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch users";
    return res.status(500).json({ error: message });
  }
}

export async function updateUserController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const userId = typeof req?.params?.userId === "string" ? req.params.userId.trim() : "";
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const name = typeof req?.body?.name === "string" ? req.body.name.trim() : undefined;
    const phone = typeof req?.body?.phone === "string" ? req.body.phone.trim() : undefined;
    const status = typeof req?.body?.status === "string" ? req.body.status.trim() : undefined;

    if (status && !USER_STATUSES_ENUM.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.role === "super_admin") return res.status(403).json({ error: "Super admin cannot be edited here" });

    let hasChanges = false;

    if (name !== undefined && name) {
      user.name = name;
      hasChanges = true;
    }

    if (phone !== undefined) {
      user.phone = phone;
      hasChanges = true;
    }

    if (status !== undefined) {
      user.status = status;
      hasChanges = true;
    }

    if (!hasChanges) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await user.save();

    return res.json({
      user: buildUserResponse(user)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update user";
    return res.status(500).json({ error: message });
  }
}
