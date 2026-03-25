import express from "express";
import { createUserController, listUsersController, updateUserController } from "../Controllers/userController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { roleMiddleware } from "../middlewares/roleMiddleware.js";

export const userRouter = express.Router();

userRouter.get("/", authMiddleware, roleMiddleware(["super_admin"]), listUsersController);
userRouter.post("/", authMiddleware, createUserController);
userRouter.patch("/:userId", authMiddleware, roleMiddleware(["super_admin"]), updateUserController);
