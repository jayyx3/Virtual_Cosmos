import mongoose from "mongoose";

export async function connectMongo(): Promise<boolean> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[db] MONGODB_URI is not set. Running without MongoDB persistence.");
    return false;
  }

  try {
    await mongoose.connect(uri, { dbName: process.env.MONGODB_DB ?? "virtual_cosmos" });
    console.log("[db] MongoDB connected");
    return true;
  } catch (error) {
    console.error("[db] MongoDB connection failed:", error);
    return false;
  }
}
