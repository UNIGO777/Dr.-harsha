import express from "express";
import {
  logoutController,
  meController,
  refreshTokenController,
  requestLoginOtpController,
  verifyLoginOtpController
} from "../Controllers/authController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export const authRouter = express.Router();

authRouter.post("/login/request-otp", requestLoginOtpController);
authRouter.post("/login/verify-otp", verifyLoginOtpController);
authRouter.post("/refresh-token", refreshTokenController);
authRouter.post("/logout", logoutController);
authRouter.get("/me", authMiddleware, meController);
