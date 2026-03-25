import express from "express";
import { createUserController } from "../Controllers/userController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export const userRouter = express.Router();

userRouter.post("/", authMiddleware, createUserController);
