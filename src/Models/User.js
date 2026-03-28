import mongoose from "mongoose";
import bcrypt from "bcrypt";

const USER_ROLES = ["super_admin", "doctor", "nurse", "patient"];
const USER_STATUSES = ["active", "blocked"];
const USER_NUMBER_COUNTER_KEY = "user_number";
const USER_NUMBER_START = 100000;

const otpSchema = new mongoose.Schema(
  {
    codeHash: { type: String, default: "" },
    expiresAt: { type: Date, default: null },
    requestedAt: { type: Date, default: null },
    verifiedTokenHash: { type: String, default: "" },
    verifiedAt: { type: Date, default: null }
  },
  { _id: false }
);

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, default: "" },
    expiresAt: { type: Date, default: null }
  },
  { _id: false }
);

const counterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, required: true, unique: true, index: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true },
    userNumber: { type: Number, unique: true, index: true },
    phone: { type: String, trim: true, default: "" },
    status: { type: String, enum: USER_STATUSES, default: "active" },
    loginOtp: { type: otpSchema, default: () => ({}) },
    emailUpdateOtp: { type: otpSchema, default: () => ({}) },
    passwordUpdateOtp: { type: otpSchema, default: () => ({}) },
    refreshToken: { type: refreshTokenSchema, default: () => ({}) },
    lastLoginAt: { type: Date, default: null }
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  try {
    if (!this.isModified("password")) return next();
    const saltRounds = 10;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.pre("validate", async function assignUserNumber(next) {
  try {
    if (!this.isNew || this.userNumber) return next();

    const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);
    const counter = await Counter.findOneAndUpdate(
      { key: USER_NUMBER_COUNTER_KEY },
      { $inc: { value: 1 }, $setOnInsert: { key: USER_NUMBER_COUNTER_KEY } },
      { new: true, upsert: true }
    );

    this.userNumber = counter.value >= USER_NUMBER_START ? counter.value : USER_NUMBER_START + counter.value;
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.methods.comparePassword = async function comparePassword(plain) {
  return bcrypt.compare(String(plain || ""), this.password);
};

export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const USER_ROLES_ENUM = USER_ROLES;
export const USER_STATUSES_ENUM = USER_STATUSES;
