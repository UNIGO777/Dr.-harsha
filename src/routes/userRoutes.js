import express from "express";
import multer from "multer";
import {
  createUserController,
  generateUserEmailDraftController,
  listNursePatientManagementController,
  listUsersController,
  sendUserEmailController,
  updateUserController,
  validateUserEmailAttachments
} from "../Controllers/userController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { roleMiddleware } from "../middlewares/roleMiddleware.js";

export const userRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 10 * 1024 * 1024 } });

userRouter.get("/", authMiddleware, roleMiddleware(["super_admin", "doctor", "nurse"]), listUsersController);
userRouter.get("/nurse/patients", authMiddleware, roleMiddleware(["nurse"]), listNursePatientManagementController);
userRouter.post("/", authMiddleware, createUserController);
userRouter.patch("/:userId", authMiddleware, roleMiddleware(["super_admin"]), updateUserController);
userRouter.post("/:userId/generate-email", authMiddleware, roleMiddleware(["super_admin"]), generateUserEmailDraftController);
userRouter.post(
  "/:userId/send-email",
  authMiddleware,
  roleMiddleware(["super_admin"]),
  upload.array("attachments", 5),
  validateUserEmailAttachments,
  sendUserEmailController
);
