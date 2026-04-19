import { CrmTask } from "../Models/CrmTask.js";
import { Appointment } from "../Models/Appointment.js";
import { NurseProfile } from "../Models/NurseProfile.js";
import { PatientProfile } from "../Models/PatientProfile.js";

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

async function getNurseDashboardScope(nurseId) {
  const nurseProfile = await NurseProfile.findOne({ user: nurseId })
    .populate("assignedDoctor", "name email phone status userNumber")
    .lean();

  const managedDoctor = nurseProfile?.assignedDoctor || null;

  const patientQuery = { assignedNurses: nurseId };
  if (managedDoctor?._id) {
    patientQuery.assignedDoctors = managedDoctor._id;
  }

  const patientProfiles = await PatientProfile.find(patientQuery)
    .populate("user", "name email phone status userNumber")
    .lean();

  const patientIds = patientProfiles
    .map((p) => p?.user?._id?.toString?.() || "")
    .filter(Boolean);

  return { managedDoctor, patientProfiles, patientIds };
}

export async function getNurseDashboardController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const nurseId = req?.user?._id?.toString?.() || "";
    if (!nurseId) return res.status(401).json({ error: "Unauthorized" });

    const { managedDoctor, patientProfiles, patientIds } = await getNurseDashboardScope(nurseId);

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    // Queue 1 — Today Calls: call-type tasks due today or overdue
    const todayCallQuery = {
      assignedNurse: nurseId,
      status: { $in: ["pending", "in_progress"] },
      category: { $in: ["call", "urgent_callback", "appointment_confirmation"] },
      $or: [{ dueAt: { $lte: endOfToday } }, { dueAt: null }]
    };

    const [todayCallItems, todayCallsCount] = await Promise.all([
      CrmTask.find(todayCallQuery)
        .populate("patient", "name email phone status userNumber")
        .sort({ escalationRequired: -1, priority: -1, dueAt: 1 })
        .limit(5)
        .lean(),
      CrmTask.countDocuments(todayCallQuery)
    ]);

    // Queue 2 — Pending Follow-ups: tasks with overdue followUpAt
    const followUpQuery = {
      assignedNurse: nurseId,
      status: { $in: ["pending", "in_progress"] },
      followUpAt: { $lte: now }
    };

    const [followUpItems, pendingFollowUpsCount] = await Promise.all([
      CrmTask.find(followUpQuery)
        .populate("patient", "name email phone status userNumber")
        .sort({ followUpAt: 1, priority: -1 })
        .limit(5)
        .lean(),
      CrmTask.countDocuments(followUpQuery)
    ]);

    // Queue 3 — New Patients: assigned patients with no prior interaction
    const newPatientProfiles = patientProfiles
      .filter((p) => !p.lastInteractionAt)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const newPatientsCount = newPatientProfiles.length;

    // Queue 4 — Missed Appointments: no_show status
    const missedQuery = {
      doctor: managedDoctor?._id,
      patient: { $in: patientIds },
      status: "no_show"
    };

    const [missedItems, missedCount] = await Promise.all([
      managedDoctor?._id
        ? Appointment.find(missedQuery)
            .populate("patient", "name email phone status userNumber")
            .sort({ scheduledAt: -1 })
            .limit(5)
            .lean()
        : Promise.resolve([]),
      managedDoctor?._id ? Appointment.countDocuments(missedQuery) : Promise.resolve(0)
    ]);

    // Summary stats
    const [openCrmTasks, escalations, todayAppointments] = await Promise.all([
      CrmTask.countDocuments({
        assignedNurse: nurseId,
        status: { $in: ["pending", "in_progress"] }
      }),
      CrmTask.countDocuments({
        assignedNurse: nurseId,
        status: { $in: ["pending", "in_progress"] },
        escalationRequired: true
      }),
      managedDoctor?._id
        ? Appointment.countDocuments({
            doctor: managedDoctor._id,
            patient: { $in: patientIds },
            status: { $in: ["scheduled", "pending", "confirmed", "checked_in"] },
            scheduledAt: { $gte: startOfToday, $lte: endOfToday }
          })
        : Promise.resolve(0)
    ]);

    return res.json({
      queues: {
        todayCalls: {
          count: todayCallsCount,
          items: todayCallItems.map((t) => ({
            id: t._id.toString(),
            title: t.title,
            category: t.category,
            priority: t.priority,
            dueAt: t.dueAt || null,
            escalationRequired: Boolean(t.escalationRequired),
            patient: buildUserOption(t.patient)
          }))
        },
        pendingFollowUps: {
          count: pendingFollowUpsCount,
          items: followUpItems.map((t) => ({
            id: t._id.toString(),
            title: t.title,
            category: t.category,
            priority: t.priority,
            followUpAt: t.followUpAt || null,
            patient: buildUserOption(t.patient)
          }))
        },
        newPatients: {
          count: newPatientsCount,
          items: newPatientProfiles.slice(0, 5).map((p) => ({
            id: p.user?._id?.toString() || "",
            name: p.user?.name || "",
            email: p.user?.email || "",
            phone: p.user?.phone || "",
            priority: p.priority || "medium",
            services: p.services || [],
            createdAt: p.createdAt || null
          }))
        },
        missedAppointments: {
          count: missedCount,
          items: missedItems.map((a) => ({
            id: a._id.toString(),
            scheduledAt: a.scheduledAt,
            reason: a.reason || "",
            appointmentType: a.appointmentType || "in_person",
            patient: buildUserOption(a.patient)
          }))
        }
      },
      summary: {
        totalPatients: patientIds.length,
        openCrmTasks,
        todayAppointments,
        escalations
      },
      context: {
        managedDoctor: managedDoctor ? buildUserOption(managedDoctor) : null
      }
    });
  } catch (err) {
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Failed to load nurse dashboard";
    return res.status(statusCode).json({ error: message });
  }
}
