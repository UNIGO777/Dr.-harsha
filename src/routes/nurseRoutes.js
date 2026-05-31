import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { roleMiddleware } from "../middlewares/roleMiddleware.js";
import {
  listRequestedAppointmentsController,
  updateRequestedAppointmentStatusController
} from "../Controllers/nurseRequestedAppointmentsController.js";

export const nurseRouter = express.Router();

const nurseAuth = [authMiddleware, roleMiddleware(["nurse"])];

// ── Requested Appointments ──
nurseRouter.get("/requested-appointments", ...nurseAuth, listRequestedAppointmentsController);
nurseRouter.patch("/requested-appointments/:id/status", ...nurseAuth, updateRequestedAppointmentStatusController);
