import express from "express";
import multer from "multer";
import {
  createUserController,
  listNursePatientManagementController,
  listUsersController,
  updateUserController
} from "../Controllers/userController.js";
import {
  createNurseCrmTaskController,
  generateNurseCrmTaskDraftController,
  listNurseCrmTasksController,
  updateNurseCrmTaskController
} from "../Controllers/nurseCrmController.js";
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
userRouter.get("/nurse/patients", authMiddleware, roleMiddleware(["nurse"]), listNursePatientManagementController);
userRouter.get("/nurse/crm", authMiddleware, roleMiddleware(["nurse"]), listNurseCrmTasksController);
userRouter.get("/broadcast-recipients", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listBroadcastRecipientsController);
userRouter.get("/broadcast-history", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listBroadcastHistoryController);
userRouter.post("/", authMiddleware, createUserController);
userRouter.post("/nurse/crm", authMiddleware, roleMiddleware(["nurse"]), createNurseCrmTaskController);
userRouter.post("/nurse/crm/draft", authMiddleware, roleMiddleware(["nurse"]), generateNurseCrmTaskDraftController);
userRouter.post("/broadcast-email/draft", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), generateBroadcastEmailDraftController);
userRouter.post(
  "/broadcast-email",
  authMiddleware,
  roleMiddleware(["super_admin", "doctor", "nurse"]),
  upload.array("attachments", 5),
  validateUserEmailAttachments,
  sendBroadcastEmailController
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
