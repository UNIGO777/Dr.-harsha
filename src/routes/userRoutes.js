import express from "express";
import multer from "multer";
import {
  addPatientMedicationController,
  addNursePatientProfileNoteController,
  createUserController,
  getPatientMedicationsController,
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
  generateNurseAppointmentInstructionDraftController,
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
import {
  createPatientReportController,
  deletePatientReportDocumentController,
  downloadPatientReportDocumentController,
  getPatientReportController,
  listPatientReportsController,
  savePatientReportController,
  uploadPatientReportDocumentsController
} from "../Controllers/patientReportController.js";
import { searchMedicineNamesController } from "../Controllers/clinicalTablesController.js";
import { getNurseDashboardController } from "../Controllers/nurseDashboardController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { roleMiddleware } from "../middlewares/roleMiddleware.js";

export const userRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 10 * 1024 * 1024 } });
const reportDocumentUpload = multer({ storage: multer.memoryStorage(), limits: { files: 20, fileSize: 15 * 1024 * 1024 } });

userRouter.get("/clinical-tables/medicines/search", searchMedicineNamesController);
userRouter.get("/", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listUsersController);
userRouter.get("/appointment-slots", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listDoctorAppointmentSlotsController);
userRouter.get("/doctor/schedule", authMiddleware, roleMiddleware(["doctor"]), getDoctorScheduleController);
userRouter.get("/nurse/patients", authMiddleware, roleMiddleware(["nurse"]), listNursePatientManagementController);
userRouter.get("/nurse/patients/:patientId/profile", authMiddleware, roleMiddleware(["nurse"]), getNursePatientProfileController);
userRouter.get("/nurse/patients/:patientId/report", authMiddleware, roleMiddleware(["nurse", "doctor"]), getPatientReportController);
userRouter.get("/patients/:patientId/reports", authMiddleware, roleMiddleware(["nurse", "doctor"]), listPatientReportsController);
userRouter.get("/patients/:patientId/reports/:reportId", authMiddleware, roleMiddleware(["nurse", "doctor"]), getPatientReportController);
userRouter.get("/patients/:patientId/report/documents/:documentId", authMiddleware, roleMiddleware(["nurse", "doctor"]), downloadPatientReportDocumentController);
userRouter.get("/patients/:patientId/reports/:reportId/documents/:documentId", authMiddleware, roleMiddleware(["nurse", "doctor"]), downloadPatientReportDocumentController);
userRouter.get("/patients/:patientId/medications", authMiddleware, roleMiddleware(["doctor", "nurse"]), getPatientMedicationsController);
userRouter.get("/nurse/dashboard", authMiddleware, roleMiddleware(["nurse"]), getNurseDashboardController);
userRouter.get("/nurse/appointments", authMiddleware, roleMiddleware(["nurse"]), listNurseUpcomingAppointmentsController);
userRouter.get("/nurse/crm", authMiddleware, roleMiddleware(["nurse"]), listNurseCrmTasksController);
userRouter.get("/broadcast-recipients", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listBroadcastRecipientsController);
userRouter.get("/broadcast-history", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listBroadcastHistoryController);
userRouter.post("/", authMiddleware, createUserController);
userRouter.post("/nurse/crm", authMiddleware, roleMiddleware(["nurse"]), createNurseCrmTaskController);
userRouter.post("/nurse/crm/draft", authMiddleware, roleMiddleware(["nurse"]), generateNurseCrmTaskDraftController);
userRouter.post("/nurse/appointments", authMiddleware, roleMiddleware(["nurse"]), scheduleNurseAppointmentController);
userRouter.post("/nurse/appointments/:appointmentId/instruction-draft", authMiddleware, roleMiddleware(["nurse"]), generateNurseAppointmentInstructionDraftController);
userRouter.post("/nurse/follow-ups", authMiddleware, roleMiddleware(["nurse"]), scheduleNurseFollowUpController);
userRouter.post("/patients/:patientId/medications", authMiddleware, roleMiddleware(["doctor", "nurse"]), addPatientMedicationController);
userRouter.post("/nurse/patients/:patientId/notes", authMiddleware, roleMiddleware(["nurse"]), addNursePatientProfileNoteController);
userRouter.post("/nurse/patients/:patientId/reports", authMiddleware, roleMiddleware(["nurse"]), createPatientReportController);
userRouter.post(
  "/nurse/patients/:patientId/report/documents",
  authMiddleware,
  roleMiddleware(["nurse"]),
  reportDocumentUpload.array("documents", 20),
  uploadPatientReportDocumentsController
);
userRouter.post(
  "/nurse/patients/:patientId/reports/:reportId/documents",
  authMiddleware,
  roleMiddleware(["nurse"]),
  reportDocumentUpload.array("documents", 20),
  uploadPatientReportDocumentsController
);
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
userRouter.patch("/nurse/patients/:patientId/report", authMiddleware, roleMiddleware(["nurse"]), savePatientReportController);
userRouter.patch("/nurse/patients/:patientId/reports/:reportId", authMiddleware, roleMiddleware(["nurse"]), savePatientReportController);
userRouter.delete(
  "/nurse/patients/:patientId/report/documents/:documentId",
  authMiddleware,
  roleMiddleware(["nurse"]),
  deletePatientReportDocumentController
);
userRouter.delete(
  "/nurse/patients/:patientId/reports/:reportId/documents/:documentId",
  authMiddleware,
  roleMiddleware(["nurse"]),
  deletePatientReportDocumentController
);
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
