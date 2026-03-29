import mongoose from "mongoose";

const doctorProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    allowCustomSchedule: { type: Boolean, default: false },
    weeklyAvailability: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export const DoctorProfile =
  mongoose.models.DoctorProfile || mongoose.model("DoctorProfile", doctorProfileSchema);
