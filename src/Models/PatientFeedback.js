import mongoose from "mongoose";

const patientFeedbackSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
    ratings: {
      overall: { type: Number, min: 1, max: 5, required: true },
      doctorCommunication: { type: Number, min: 1, max: 5, default: null },
      waitTime: { type: Number, min: 1, max: 5, default: null },
      staffBehavior: { type: Number, min: 1, max: 5, default: null },
    },
    comment: { type: String, trim: true, default: "" },
    anonymous: { type: Boolean, default: false },
  },
  { timestamps: true }
);

patientFeedbackSchema.index({ patient: 1, createdAt: -1 });
patientFeedbackSchema.index({ appointment: 1 }, { unique: true, sparse: true });

export const PatientFeedback =
  mongoose.models.PatientFeedback || mongoose.model("PatientFeedback", patientFeedbackSchema);
