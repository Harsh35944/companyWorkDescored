import mongoose from "mongoose";

const userGuildStatsSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    day: { type: String, required: true },
    translatedCharacters: { type: Number, default: 0 },
    translatedMessages: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userGuildStatsSchema.index({ guildId: 1, userId: 1, day: 1 }, { unique: true });

export const UserGuildStats =
  mongoose.models.UserGuildStats ||
  mongoose.model("UserGuildStats", userGuildStatsSchema);
