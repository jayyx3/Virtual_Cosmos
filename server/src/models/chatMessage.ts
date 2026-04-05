import mongoose, { Schema } from "mongoose";

const chatMessageSchema = new Schema(
  {
    fromUserId: { type: String, required: true, index: true },
    toUserId: { type: String, required: true, index: true },
    message: { type: String, required: true, maxlength: 500 },
    sentAt: { type: Date, required: true, default: Date.now }
  },
  { versionKey: false }
);

export const ChatMessageModel = mongoose.model("ChatMessage", chatMessageSchema);
