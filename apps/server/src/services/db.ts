import mongoose from "mongoose";

let isDbConnected = false;

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("[db] MONGODB_URI not set. Running in-memory mode.");
    return;
  }

  try {
    console.log("[db] Connecting to MongoDB...");
    await mongoose.connect(uri);
    isDbConnected = true;
    console.log("[db] MongoDB connected successfully.");
  } catch (error) {
    console.error("[db] MongoDB connection error:", error);
    console.log("[db] Falling back to in-memory mode.");
  }
}

export function isConnected(): boolean {
  return isDbConnected;
}
