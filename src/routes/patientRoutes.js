import express from "express";
import multer from "multer";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { roleMiddleware } from "../middlewares/roleMiddleware.js";
import { getPatientDashboardController } from "../Controllers/patientPanelDashboardController.js";
import {
  listPatientAppointmentsController,
  requestAppointmentController,
  requestRescheduleController,
  cancelAppointmentController
} from "../Controllers/patientPanelAppointmentController.js";
import {
  listPatientReportsController,
  getPatientReportDetailController,
  downloadPatientReportDocController
} from "../Controllers/patientPanelReportController.js";
import { listPatientMedicationsController } from "../Controllers/patientPanelMedicationController.js";
import {
  getPatientProfileController,
  updatePatientProfileController,
  updateNotificationPrefsController
} from "../Controllers/patientPanelProfileController.js";
import {
  listPatientNotificationsController,
  markNotificationReadController,
  markAllNotificationsReadController,
  getUnreadCountController
} from "../Controllers/patientPanelNotificationController.js";
import {
  listPatientDocumentsController,
  uploadDocumentController,
  deleteDocumentController,
  downloadDocumentController
} from "../Controllers/patientPanelDocumentController.js";
import { getPatientTimelineController } from "../Controllers/patientPanelTimelineController.js";
import {
  listConversationsController,
  getConversationMessagesController,
  sendMessageController
} from "../Controllers/patientPanelMessageController.js";
import {
  listAssignedDoctorsController,
  getAvailableSlotsController,
  bookAppointmentController
} from "../Controllers/patientPanelBookingController.js";
import {
  listVitalsController,
  addVitalController,
  deleteVitalController,
  getVitalTrendsController,
  listGoalsController,
  createOrUpdateGoalController
} from "../Controllers/patientPanelVitalsController.js";
import {
  listSpecialistReferralsController,
  updateSpecialistStatusController
} from "../Controllers/patientPanelSpecialistController.js";
import {
  getLifestylePlanController,
  updateChecklistController,
  getAdherenceController
} from "../Controllers/patientPanelLifestyleController.js";
import {
  listFamilyMembersController,
  addFamilyMemberController,
  updateFamilyMemberController,
  deleteFamilyMemberController,
  linkFamilyMemberController
} from "../Controllers/patientPanelFamilyController.js";
import {
  listFeedbackController,
  submitFeedbackController,
  getPendingFeedbackController
} from "../Controllers/patientPanelFeedbackController.js";

export const patientRouter = express.Router();

const patientAuth = [authMiddleware, roleMiddleware(["patient"])];
const patientDocUpload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 15 * 1024 * 1024 } });

// ── Dashboard ──
patientRouter.get("/dashboard", ...patientAuth, getPatientDashboardController);

// ── Appointments ──
patientRouter.get("/appointments", ...patientAuth, listPatientAppointmentsController);
patientRouter.post("/appointments/request", ...patientAuth, requestAppointmentController);
patientRouter.post("/appointments/:id/reschedule-request", ...patientAuth, requestRescheduleController);
patientRouter.post("/appointments/:id/cancel", ...patientAuth, cancelAppointmentController);

// ── Reports ──
patientRouter.get("/reports", ...patientAuth, listPatientReportsController);
patientRouter.get("/reports/:reportId", ...patientAuth, getPatientReportDetailController);
patientRouter.get("/reports/:reportId/documents/:docId/download", ...patientAuth, downloadPatientReportDocController);

// ── Medications ──
patientRouter.get("/medications", ...patientAuth, listPatientMedicationsController);

// ── Profile ──
patientRouter.get("/profile", ...patientAuth, getPatientProfileController);
patientRouter.patch("/profile", ...patientAuth, updatePatientProfileController);
patientRouter.patch("/profile/notification-preferences", ...patientAuth, updateNotificationPrefsController);

// ── Notifications ──
patientRouter.get("/notifications", ...patientAuth, listPatientNotificationsController);
patientRouter.patch("/notifications/:id/read", ...patientAuth, markNotificationReadController);
patientRouter.patch("/notifications/read-all", ...patientAuth, markAllNotificationsReadController);
patientRouter.get("/notifications/unread-count", ...patientAuth, getUnreadCountController);

// ── Documents ──
patientRouter.get("/documents", ...patientAuth, listPatientDocumentsController);
patientRouter.post("/documents/upload", ...patientAuth, patientDocUpload.array("files", 5), uploadDocumentController);
patientRouter.delete("/documents/:id", ...patientAuth, deleteDocumentController);
patientRouter.get("/documents/:id/download", ...patientAuth, downloadDocumentController);

// ── Timeline ──
patientRouter.get("/timeline", ...patientAuth, getPatientTimelineController);

// ── Messages ──
patientRouter.get("/messages", ...patientAuth, listConversationsController);
patientRouter.get("/messages/:conversationId", ...patientAuth, getConversationMessagesController);
patientRouter.post("/messages", ...patientAuth, sendMessageController);

// ── Booking ──
patientRouter.get("/booking/doctors", ...patientAuth, listAssignedDoctorsController);
patientRouter.get("/booking/slots", ...patientAuth, getAvailableSlotsController);
patientRouter.post("/booking/book", ...patientAuth, bookAppointmentController);

// ── Vitals & Goals ──
patientRouter.get("/vitals", ...patientAuth, listVitalsController);
patientRouter.post("/vitals", ...patientAuth, addVitalController);
patientRouter.delete("/vitals/:id", ...patientAuth, deleteVitalController);
patientRouter.get("/vitals/trends", ...patientAuth, getVitalTrendsController);
patientRouter.get("/goals", ...patientAuth, listGoalsController);
patientRouter.post("/goals", ...patientAuth, createOrUpdateGoalController);

// ── Specialists ──
patientRouter.get("/specialists", ...patientAuth, listSpecialistReferralsController);
patientRouter.put("/specialists/:reportId/:index/status", ...patientAuth, updateSpecialistStatusController);

// ── Lifestyle Plan ──
patientRouter.get("/lifestyle-plan", ...patientAuth, getLifestylePlanController);
patientRouter.post("/lifestyle-plan/checklist", ...patientAuth, updateChecklistController);
patientRouter.get("/lifestyle-plan/adherence", ...patientAuth, getAdherenceController);

// ── Family ──
patientRouter.get("/family", ...patientAuth, listFamilyMembersController);
patientRouter.post("/family", ...patientAuth, addFamilyMemberController);
patientRouter.put("/family/:id", ...patientAuth, updateFamilyMemberController);
patientRouter.delete("/family/:id", ...patientAuth, deleteFamilyMemberController);
patientRouter.post("/family/:id/link", ...patientAuth, linkFamilyMemberController);

// ── Feedback ──
patientRouter.get("/feedback", ...patientAuth, listFeedbackController);
patientRouter.post("/feedback", ...patientAuth, submitFeedbackController);
patientRouter.get("/feedback/pending", ...patientAuth, getPendingFeedbackController);
