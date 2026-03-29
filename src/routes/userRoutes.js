import express from "express";
import multer from "multer";
import {
  addNursePatientProfileNoteController,
  createUserController,
  getNursePatientProfileController,
  listNursePatientManagementController,
  listUsersController,
  updateNursePatientProfileNoteController,
  updateUserController
} from "../Controllers/userController.js";
import {
  createNurseCrmTaskController,
  generateNurseCrmTaskDraftController,
  listNurseCrmTasksController,
  updateNurseCrmTaskController
} from "../Controllers/nurseCrmController.js";
import {
  getDoctorScheduleController,
  listNurseUpcomingAppointmentsController,
  listDoctorAppointmentSlotsController,
  scheduleNurseAppointmentController,
  scheduleNurseFollowUpController,
  updateNurseAppointmentController,
  updateDoctorScheduleController
} from "../Controllers/nurseSchedulingController.js";
import {
  generateBroadcastEmailDraftController,
  generateUserEmailDraftController,
  listBroadcastHistoryController,
  listBroadcastRecipientsController,
  sendBroadcastEmailController,
  sendUserEmailController,
  validateUserEmailAttachments
} from "../Controllers/emailControllers.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { roleMiddleware } from "../middlewares/roleMiddleware.js";

export const userRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 10 * 1024 * 1024 } });

userRouter.get("/", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listUsersController);
userRouter.get("/appointment-slots", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listDoctorAppointmentSlotsController);
userRouter.get("/doctor/schedule", authMiddleware, roleMiddleware(["doctor"]), getDoctorScheduleController);
userRouter.get("/nurse/patients", authMiddleware, roleMiddleware(["nurse"]), listNursePatientManagementController);
userRouter.get("/nurse/patients/:patientId/profile", authMiddleware, roleMiddleware(["nurse"]), getNursePatientProfileController);
userRouter.get("/nurse/appointments", authMiddleware, roleMiddleware(["nurse"]), listNurseUpcomingAppointmentsController);
userRouter.get("/nurse/crm", authMiddleware, roleMiddleware(["nurse"]), listNurseCrmTasksController);
userRouter.get("/broadcast-recipients", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listBroadcastRecipientsController);
userRouter.get("/broadcast-history", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listBroadcastHistoryController);
userRouter.post("/", authMiddleware, createUserController);
userRouter.post("/nurse/crm", authMiddleware, roleMiddleware(["nurse"]), createNurseCrmTaskController);
userRouter.post("/nurse/crm/draft", authMiddleware, roleMiddleware(["nurse"]), generateNurseCrmTaskDraftController);
userRouter.post("/nurse/appointments", authMiddleware, roleMiddleware(["nurse"]), scheduleNurseAppointmentController);
userRouter.post("/nurse/follow-ups", authMiddleware, roleMiddleware(["nurse"]), scheduleNurseFollowUpController);
userRouter.post("/nurse/patients/:patientId/notes", authMiddleware, roleMiddleware(["nurse"]), addNursePatientProfileNoteController);
userRouter.post("/broadcast-email/draft", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), generateBroadcastEmailDraftController);
userRouter.post(
  "/broadcast-email",
  authMiddleware,
  roleMiddleware(["super_admin", "doctor", "nurse"]),
  upload.array("attachments", 5),
  validateUserEmailAttachments,
  sendBroadcastEmailController
);
userRouter.patch("/doctor/schedule", authMiddleware, roleMiddleware(["doctor"]), updateDoctorScheduleController);
userRouter.patch("/nurse/appointments/:appointmentId", authMiddleware, roleMiddleware(["nurse"]), updateNurseAppointmentController);
userRouter.patch("/nurse/patients/:patientId/notes/:noteId", authMiddleware, roleMiddleware(["nurse"]), updateNursePatientProfileNoteController);
userRouter.patch("/:userId", authMiddleware, roleMiddleware(["super_admin"]), updateUserController);
userRouter.patch("/nurse/crm/:taskId", authMiddleware, roleMiddleware(["nurse"]), updateNurseCrmTaskController);
userRouter.post("/:userId/generate-email", authMiddleware, roleMiddleware(["super_admin"]), generateUserEmailDraftController);
userRouter.post(
  "/:userId/send-email",
  authMiddleware,
  roleMiddleware(["super_admin"]),
  upload.array("attachments", 5),
  validateUserEmailAttachments,
  sendUserEmailController
);
