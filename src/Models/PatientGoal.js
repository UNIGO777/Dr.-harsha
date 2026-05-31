import mongoose from "mongoose";

const patientGoalSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["weight", "blood_pressure", "blood_sugar", "heart_rate", "custom"],
      required: true
    },
    title: { type: String, trim: true, required: true, maxlength: 200 },
    targetValue: { type: mongoose.Schema.Types.Mixed, required: true },
    currentValue: { type: mongoose.Schema.Types.Mixed, default: null },
    unit: { type: String, trim: true, default: "" },
    deadline: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "achieved", "abandoned"],
      default: "active"
    },
    achievedAt: { type: Date, default: null },
    setBy: { type: String, enum: ["patient", "doctor"], default: "patient" }
  },
  { timestamps: true }
);

patientGoalSchema.index({ patient: 1, status: 1 });

export const PatientGoal = mongoose.models.PatientGoal || mongoose.model("PatientGoal", patientGoalSchema);
