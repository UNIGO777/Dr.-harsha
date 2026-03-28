import mongoose from "mongoose";

const nurseProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

export const NurseProfile = mongoose.models.NurseProfile || mongoose.model("NurseProfile", nurseProfileSchema);
