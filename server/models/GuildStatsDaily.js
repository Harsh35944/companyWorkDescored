import mongoose from "mongoose";

const guildStatsDailySchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    day: { type: String, required: true },
    translatedCharacters: { type: Number, default: 0 },
    translatedMessages: { type: Number, default: 0 },
  },
  { timestamps: true },
);

guildStatsDailySchema.index({ guildId: 1, day: 1 }, { unique: true });

export const GuildStatsDaily =
  mongoose.models.GuildStatsDaily ||
  mongoose.model("GuildStatsDaily", guildStatsDailySchema);
