import mongoose from "mongoose";

const familyMemberSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    relation: { type: String, trim: true, required: true },
    age: { type: Number, min: 0 },
    gender: { type: String, enum: ["male", "female", "other"], default: "male" },
    linkedPatient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

const familyGroupSchema = new mongoose.Schema(
  {
    primaryPatient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    members: { type: [familyMemberSchema], default: [] },
  },
  { timestamps: true }
);

familyGroupSchema.index({ primaryPatient: 1 });

export const FamilyGroup =
  mongoose.models.FamilyGroup || mongoose.model("FamilyGroup", familyGroupSchema);
