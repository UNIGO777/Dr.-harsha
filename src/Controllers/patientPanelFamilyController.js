import { FamilyGroup } from "../Models/FamilyGroup.js";
import { User } from "../Models/User.js";

/**
 * GET /api/patient/family
 */
export async function listFamilyMembersController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    let group = await FamilyGroup.findOne({ primaryPatient: patientId })
      .populate("members.linkedPatient", "name email phone")
      .lean();

    if (!group) {
      return res.json({ members: [] });
    }

    const members = group.members.map((m) => ({
      id: m._id,
      name: m.name,
      relation: m.relation,
      age: m.age,
      gender: m.gender,
      linkedPatient: m.linkedPatient
        ? { id: m.linkedPatient._id, name: m.linkedPatient.name, email: m.linkedPatient.email }
        : null,
      notes: m.notes,
      createdAt: m.createdAt,
    }));

    return res.json({ members });
  } catch (err) {
    console.error("listFamilyMembers error:", err);
    return res.status(500).json({ message: "Failed to fetch family members" });
  }
}

/**
 * POST /api/patient/family
 */
export async function addFamilyMemberController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });
    const { name, relation, age, gender, notes } = req.body;

    if (!name || !relation) {
      return res.status(400).json({ message: "Name and relation are required" });
    }

    let group = await FamilyGroup.findOne({ primaryPatient: patientId });
    if (!group) {
      group = new FamilyGroup({ primaryPatient: patientId, members: [] });
    }

    group.members.push({ name, relation, age, gender, notes });
    await group.save();

    const added = group.members[group.members.length - 1];

    return res.status(201).json({
      member: { id: added._id, name: added.name, relation: added.relation, age: added.age, gender: added.gender, notes: added.notes },
    });
  } catch (err) {
    console.error("addFamilyMember error:", err);
    return res.status(500).json({ message: "Failed to add family member" });
  }
}

/**
 * PUT /api/patient/family/:id
 */
export async function updateFamilyMemberController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const { name, relation, age, gender, notes } = req.body;

    const group = await FamilyGroup.findOne({ primaryPatient: patientId });
    if (!group) return res.status(404).json({ message: "No family group found" });

    const member = group.members.id(id);
    if (!member) return res.status(404).json({ message: "Member not found" });

    if (name) member.name = name;
    if (relation) member.relation = relation;
    if (age !== undefined) member.age = age;
    if (gender) member.gender = gender;
    if (notes !== undefined) member.notes = notes;

    await group.save();

    return res.json({ member: { id: member._id, name: member.name, relation: member.relation, age: member.age, gender: member.gender, notes: member.notes } });
  } catch (err) {
    console.error("updateFamilyMember error:", err);
    return res.status(500).json({ message: "Failed to update family member" });
  }
}

/**
 * DELETE /api/patient/family/:id
 */
export async function deleteFamilyMemberController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;

    const group = await FamilyGroup.findOne({ primaryPatient: patientId });
    if (!group) return res.status(404).json({ message: "No family group found" });

    const member = group.members.id(id);
    if (!member) return res.status(404).json({ message: "Member not found" });

    member.deleteOne();
    await group.save();

    return res.json({ message: "Family member removed" });
  } catch (err) {
    console.error("deleteFamilyMember error:", err);
    return res.status(500).json({ message: "Failed to delete family member" });
  }
}

/**
 * POST /api/patient/family/:id/link
 * Link an existing patient account to a family member
 */
export async function linkFamilyMemberController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not ready" });
    const patientId = req?.user?._id?.toString?.() || "";
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required" });

    const linkedUser = await User.findOne({ email: email.toLowerCase(), role: "patient" }).lean();
    if (!linkedUser) return res.status(404).json({ message: "No patient found with that email" });
    if (linkedUser._id.toString() === patientId) {
      return res.status(400).json({ message: "Cannot link yourself" });
    }

    const group = await FamilyGroup.findOne({ primaryPatient: patientId });
    if (!group) return res.status(404).json({ message: "No family group found" });

    const member = group.members.id(id);
    if (!member) return res.status(404).json({ message: "Member not found" });

    member.linkedPatient = linkedUser._id;
    await group.save();

    return res.json({ message: "Account linked", linkedPatient: { id: linkedUser._id, name: linkedUser.name, email: linkedUser.email } });
  } catch (err) {
    console.error("linkFamilyMember error:", err);
    return res.status(500).json({ message: "Failed to link account" });
  }
}
