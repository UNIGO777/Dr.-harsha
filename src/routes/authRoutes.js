import express from "express";
import {
  completeForgotPasswordController,
  completeUpdateEmailController,
  completeUpdatePasswordWithOldPasswordController,
  completeUpdatePasswordWithOtpController,
  logoutController,
  meController,
  refreshTokenController,
  requestForgotPasswordOtpController,
  requestLoginOtpController,
  requestUpdateEmailOtpController,
  requestUpdatePasswordOtpController,
  updateProfileController,
  verifyForgotPasswordOtpController,
  verifyLoginOtpController,
  verifyUpdateEmailOtpController,
  verifyUpdatePasswordOtpController
} from "../Controllers/authController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export const authRouter = express.Router();

authRouter.post("/login/request-otp", requestLoginOtpController);
authRouter.post("/login/verify-otp", verifyLoginOtpController);
authRouter.post("/forgot-password/request-otp", requestForgotPasswordOtpController);
authRouter.post("/forgot-password/verify-otp", verifyForgotPasswordOtpController);
authRouter.post("/forgot-password/complete", completeForgotPasswordController);
authRouter.post("/refresh-token", refreshTokenController);
authRouter.post("/logout", logoutController);
authRouter.get("/me", authMiddleware, meController);
authRouter.patch("/profile", authMiddleware, updateProfileController);
authRouter.post("/profile/update-email/request-otp", authMiddleware, requestUpdateEmailOtpController);
authRouter.post("/profile/update-email/verify-otp", authMiddleware, verifyUpdateEmailOtpController);
authRouter.post("/profile/update-email/complete", authMiddleware, completeUpdateEmailController);
authRouter.post("/profile/update-password/request-otp", authMiddleware, requestUpdatePasswordOtpController);
authRouter.post("/profile/update-password/verify-otp", authMiddleware, verifyUpdatePasswordOtpController);
authRouter.post("/profile/update-password/complete-with-otp", authMiddleware, completeUpdatePasswordWithOtpController);
authRouter.post("/profile/update-password/complete-with-password", authMiddleware, completeUpdatePasswordWithOldPasswordController);
