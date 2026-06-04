import express from "express";
import multer from "multer";
import {
  addDoctorPatientProfileNoteController,
  addPatientMedicationController,
  addNursePatientProfileNoteController,
  createUserController,
  getDoctorPatientProfileController,
  getPatientMedicationsController,
  getNursePatientProfileController,
  listDoctorPatientsController,
  listNursePatientManagementController,
  listUsersController,
  updateDoctorPatientProfileNoteController,
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
  listDoctorAppointmentsController,
  listNurseUpcomingAppointmentsController,
  listDoctorAppointmentSlotsController,
  scheduleDoctorAppointmentController,
  scheduleDoctorFollowUpController,
  scheduleNurseAppointmentController,
  scheduleNurseFollowUpController,
  updateDoctorAppointmentController,
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
import { getDoctorDashboardController } from "../Controllers/doctorDashboardController.js";
import { getAdminDashboardController } from "../Controllers/adminDashboardController.js";
import { listAdminAppointmentsController, updateAdminAppointmentController } from "../Controllers/adminAppointmentsController.js";
import { getAdminAnalyticsController } from "../Controllers/adminAnalyticsController.js";
import { listAdminCrmTasksController } from "../Controllers/adminCrmController.js";
import { getAdminAssignmentsController, updateAdminPatientAssignmentController } from "../Controllers/adminAssignmentsController.js";
import {
  getAdminPatientProfileController,
  addAdminPatientMedicationController,
  updateAdminPatientMedicationController,
  deleteAdminPatientMedicationController,
  addAdminPatientNoteController,
  updateAdminPatientNoteController,
  deleteAdminPatientNoteController
} from "../Controllers/adminPatientController.js";
import {
  createDoctorAssignmentController,
  listDoctorAssignmentsController,
  updateDoctorAssignmentController
} from "../Controllers/doctorAssignmentController.js";
import { generatePdfController } from "../Controllers/pdfController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { roleMiddleware } from "../middlewares/roleMiddleware.js";

export const userRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 10 * 1024 * 1024 } });
const reportDocumentUpload = multer({ storage: multer.memoryStorage(), limits: { files: 20, fileSize: 15 * 1024 * 1024 } });

userRouter.get("/clinical-tables/medicines/search", authMiddleware, searchMedicineNamesController);
userRouter.get("/", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listUsersController);
userRouter.get("/appointment-slots", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listDoctorAppointmentSlotsController);
userRouter.get("/doctor/schedule", authMiddleware, roleMiddleware(["doctor"]), getDoctorScheduleController);
userRouter.get("/doctor/appointments", authMiddleware, roleMiddleware(["doctor"]), listDoctorAppointmentsController);
userRouter.get("/doctor/patients", authMiddleware, roleMiddleware(["doctor"]), listDoctorPatientsController);
userRouter.get("/doctor/patients/:patientId/profile", authMiddleware, roleMiddleware(["doctor"]), getDoctorPatientProfileController);
userRouter.post("/doctor/patients/:patientId/notes", authMiddleware, roleMiddleware(["doctor"]), addDoctorPatientProfileNoteController);
userRouter.patch("/doctor/patients/:patientId/notes/:noteId", authMiddleware, roleMiddleware(["doctor"]), updateDoctorPatientProfileNoteController);
userRouter.post("/doctor/appointments", authMiddleware, roleMiddleware(["doctor"]), scheduleDoctorAppointmentController);
userRouter.post("/doctor/follow-ups", authMiddleware, roleMiddleware(["doctor"]), scheduleDoctorFollowUpController);
userRouter.patch("/doctor/appointments/:appointmentId", authMiddleware, roleMiddleware(["doctor"]), updateDoctorAppointmentController);
userRouter.get("/doctor/assignments", authMiddleware, roleMiddleware(["doctor"]), listDoctorAssignmentsController);
userRouter.post("/doctor/assignments", authMiddleware, roleMiddleware(["doctor"]), createDoctorAssignmentController);
userRouter.patch("/doctor/assignments/:assignmentId", authMiddleware, roleMiddleware(["doctor"]), updateDoctorAssignmentController);
userRouter.get("/nurse/patients", authMiddleware, roleMiddleware(["nurse"]), listNursePatientManagementController);
userRouter.get("/nurse/patients/:patientId/profile", authMiddleware, roleMiddleware(["nurse"]), getNursePatientProfileController);
userRouter.get("/nurse/patients/:patientId/report", authMiddleware, roleMiddleware(["nurse", "doctor"]), getPatientReportController);
userRouter.get("/patients/:patientId/reports", authMiddleware, roleMiddleware(["nurse", "doctor", "super_admin"]), listPatientReportsController);
userRouter.get("/patients/:patientId/reports/:reportId", authMiddleware, roleMiddleware(["nurse", "doctor", "super_admin"]), getPatientReportController);
userRouter.get("/patients/:patientId/report/documents/:documentId", authMiddleware, roleMiddleware(["nurse", "doctor", "super_admin"]), downloadPatientReportDocumentController);
userRouter.get("/patients/:patientId/reports/:reportId/documents/:documentId", authMiddleware, roleMiddleware(["nurse", "doctor", "super_admin"]), downloadPatientReportDocumentController);
userRouter.get("/patients/:patientId/medications", authMiddleware, roleMiddleware(["doctor", "nurse", "super_admin"]), getPatientMedicationsController);
userRouter.get("/nurse/dashboard", authMiddleware, roleMiddleware(["nurse"]), getNurseDashboardController);
userRouter.get("/doctor/dashboard", authMiddleware, roleMiddleware(["doctor"]), getDoctorDashboardController);
userRouter.get("/admin/dashboard", authMiddleware, roleMiddleware(["super_admin"]), getAdminDashboardController);
userRouter.get("/admin/appointments", authMiddleware, roleMiddleware(["super_admin"]), listAdminAppointmentsController);
userRouter.patch("/admin/appointments/:appointmentId", authMiddleware, roleMiddleware(["super_admin"]), updateAdminAppointmentController);
userRouter.get("/admin/analytics", authMiddleware, roleMiddleware(["super_admin"]), getAdminAnalyticsController);
userRouter.get("/admin/crm", authMiddleware, roleMiddleware(["super_admin"]), listAdminCrmTasksController);
userRouter.get("/admin/assignments", authMiddleware, roleMiddleware(["super_admin"]), getAdminAssignmentsController);
userRouter.patch("/admin/assignments", authMiddleware, roleMiddleware(["super_admin"]), updateAdminPatientAssignmentController);
userRouter.get("/admin/patients/:patientId/profile", authMiddleware, roleMiddleware(["super_admin"]), getAdminPatientProfileController);
userRouter.post("/admin/patients/:patientId/medications", authMiddleware, roleMiddleware(["super_admin"]), addAdminPatientMedicationController);
userRouter.patch("/admin/patients/:patientId/medications/:medicationId", authMiddleware, roleMiddleware(["super_admin"]), updateAdminPatientMedicationController);
userRouter.delete("/admin/patients/:patientId/medications/:medicationId", authMiddleware, roleMiddleware(["super_admin"]), deleteAdminPatientMedicationController);
userRouter.post("/admin/patients/:patientId/notes", authMiddleware, roleMiddleware(["super_admin"]), addAdminPatientNoteController);
userRouter.patch("/admin/patients/:patientId/notes/:noteId", authMiddleware, roleMiddleware(["super_admin"]), updateAdminPatientNoteController);
userRouter.delete("/admin/patients/:patientId/notes/:noteId", authMiddleware, roleMiddleware(["super_admin"]), deleteAdminPatientNoteController);
userRouter.get("/nurse/appointments", authMiddleware, roleMiddleware(["nurse"]), listNurseUpcomingAppointmentsController);
userRouter.get("/nurse/crm", authMiddleware, roleMiddleware(["nurse"]), listNurseCrmTasksController);
userRouter.get("/broadcast-recipients", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listBroadcastRecipientsController);
userRouter.get("/broadcast-history", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listBroadcastHistoryController);
userRouter.post("/", authMiddleware, createUserController);
userRouter.post("/nurse/crm", authMiddleware, roleMiddleware(["nurse"]), createNurseCrmTaskController);
userRouter.post("/nurse/crm/draft", authMiddleware, roleMiddleware(["nurse"]), generateNurseCrmTaskDraftController);
userRouter.post("/nurse/appointments", authMiddleware, roleMiddleware(["nurse"]), scheduleNurseAppointmentController);
userRouter.post("/nurse/appointments/:appointmentId/instruction-draft", authMiddleware, roleMiddleware(["nurse", "doctor"]), generateNurseAppointmentInstructionDraftController);
userRouter.post("/nurse/follow-ups", authMiddleware, roleMiddleware(["nurse"]), scheduleNurseFollowUpController);
userRouter.post("/patients/:patientId/medications", authMiddleware, roleMiddleware(["doctor", "nurse"]), addPatientMedicationController);
userRouter.post("/nurse/patients/:patientId/notes", authMiddleware, roleMiddleware(["nurse"]), addNursePatientProfileNoteController);
userRouter.post("/nurse/patients/:patientId/reports", authMiddleware, roleMiddleware(["nurse", "doctor", "super_admin"]), createPatientReportController);
userRouter.post(
  "/nurse/patients/:patientId/report/documents",
  authMiddleware,
  roleMiddleware(["nurse", "doctor", "super_admin"]),
  reportDocumentUpload.array("documents", 20),
  uploadPatientReportDocumentsController
);
userRouter.post(
  "/nurse/patients/:patientId/reports/:reportId/documents",
  authMiddleware,
  roleMiddleware(["nurse", "doctor", "super_admin"]),
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
userRouter.patch("/nurse/patients/:patientId/report", authMiddleware, roleMiddleware(["nurse", "doctor", "super_admin"]), savePatientReportController);
userRouter.patch("/nurse/patients/:patientId/reports/:reportId", authMiddleware, roleMiddleware(["nurse", "doctor", "super_admin"]), savePatientReportController);
userRouter.delete(
  "/nurse/patients/:patientId/report/documents/:documentId",
  authMiddleware,
  roleMiddleware(["nurse", "doctor", "super_admin"]),
  deletePatientReportDocumentController
);
userRouter.delete(
  "/nurse/patients/:patientId/reports/:reportId/documents/:documentId",
  authMiddleware,
  roleMiddleware(["nurse", "doctor", "super_admin"]),
  deletePatientReportDocumentController
);
userRouter.post("/generate-pdf", authMiddleware, roleMiddleware(["nurse", "doctor", "super_admin"]), generatePdfController);
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
