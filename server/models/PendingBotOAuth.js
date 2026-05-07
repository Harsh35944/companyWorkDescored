import mongoose from "mongoose";

const pendingBotOAuthSchema = new mongoose.Schema({
  state: { type: String, required: true, unique: true },
  discordUserId: { type: String, required: true },
  guildId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

pendingBotOAuthSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

export const PendingBotOAuth =
  mongoose.models.PendingBotOAuth ||
  mongoose.model("PendingBotOAuth", pendingBotOAuthSchema);
