import "dotenv/config";
import mongoose from "mongoose";

import { User } from "../Models/User.js";
import { connectDb } from "../utils/connectDb.js";

function requireValue(value, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized;
}

function getDefaultAdminInput() {
  return {
    name: requireValue(process.env.DEFAULT_ADMIN_NAME || "Default Super Admin", "DEFAULT_ADMIN_NAME"),
    email: requireValue(process.env.DEFAULT_ADMIN_EMAIL || "admin@example.com", "DEFAULT_ADMIN_EMAIL").toLowerCase(),
    password: requireValue(process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123456", "DEFAULT_ADMIN_PASSWORD"),
    phone: String(process.env.DEFAULT_ADMIN_PHONE || "").trim(),
    status: "active",
    role: "super_admin"
  };
}

async function seedDefaultAdmin() {
  const connection = await connectDb();
  if (!connection.connected) {
    throw new Error(connection.reason || "Database connection failed");
  }

  const adminInput = getDefaultAdminInput();
  const existingUser = await User.findOne({ email: adminInput.email }).select("+password");

  if (existingUser) {
    existingUser.name = adminInput.name;
    existingUser.password = adminInput.password;
    existingUser.phone = adminInput.phone;
    existingUser.status = adminInput.status;
    existingUser.role = adminInput.role;
    await existingUser.save();

    console.log(`Default super admin updated: ${existingUser.email}`);
    return existingUser;
  }

  const createdUser = await User.create(adminInput);
  console.log(`Default super admin created: ${createdUser.email}`);
  return createdUser;
}

seedDefaultAdmin()
  .then(async () => {
    await mongoose.connection.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : "Failed to seed default admin");
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    process.exit(1);
  });
