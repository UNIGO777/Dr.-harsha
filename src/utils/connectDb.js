import mongoose from "mongoose";

export async function connectDb({ mongoUri } = {}) {
  const uri = typeof mongoUri === "string" && mongoUri.trim() ? mongoUri.trim() : process.env.MONGODB_URI || process.env.MONGO_URI || "";
  if (!uri) return { connected: false, reason: "Missing MONGODB_URI/MONGO_URI" };
  if (mongoose.connection.readyState === 1) return { connected: true };

  await mongoose.connect(uri, {
    maxPoolSize: 20,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    connectTimeoutMS: 10_000,
    maxIdleTimeMS: 30_000,
  });
  return { connected: mongoose.connection.readyState === 1 };
}

