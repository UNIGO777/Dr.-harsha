import { CrmTask } from "../Models/CrmTask.js";

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

export async function listAdminCrmTasksController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const userId = req?.user?._id?.toString?.() || "";
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const {
      nurseId,
      patientId,
      status,
      category,
      priority,
      page: rawPage,
      limit: rawLimit
    } = req.query;

    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (nurseId) filter.assignedNurse = nurseId;
    if (patientId) filter.patient = patientId;
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;

    const now = new Date();

    const [items, total, totalPending, totalCompleted, totalOverdue] = await Promise.all([
      CrmTask.find(filter)
        .populate("patient", "name email phone status userNumber")
        .populate("assignedNurse", "name email phone status userNumber")
        .populate("assignedDoctor", "name email phone status userNumber")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CrmTask.countDocuments(filter),
      CrmTask.countDocuments({ ...filter, status: "pending" }),
      CrmTask.countDocuments({ ...filter, status: "completed" }),
      CrmTask.countDocuments({
        ...filter,
        status: { $in: ["pending", "in_progress"] },
        dueAt: { $lt: now, $ne: null }
      })
    ]);

    return res.json({
      stats: {
        total,
        pending: totalPending,
        completed: totalCompleted,
        overdue: totalOverdue
      },
      items: items.map((t) => ({
        id: t._id.toString(),
        title: t.title,
        description: t.description || "",
        category: t.category,
        status: t.status,
        priority: t.priority,
        dueAt: t.dueAt,
        followUpAt: t.followUpAt,
        callOutcome: t.callOutcome,
        lastCalledAt: t.lastCalledAt,
        completedAt: t.completedAt,
        responseSummary: t.responseSummary || "",
        patientResponse: t.patientResponse || "",
        nextStep: t.nextStep || "",
        escalationRequired: t.escalationRequired || false,
        notes: (t.notes || []).map((n) => ({
          content: n.content,
          createdAt: n.createdAt
        })),
        patient: buildUserOption(t.patient),
        assignedNurse: buildUserOption(t.assignedNurse),
        assignedDoctor: buildUserOption(t.assignedDoctor),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to load CRM tasks";
    return res.status(statusCode).json({ error: message });
  }
}
