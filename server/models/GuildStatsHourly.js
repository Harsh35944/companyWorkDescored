import mongoose from "mongoose";

const guildStatsHourlySchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    hourBucket: { type: Date, required: true },
    translatedCharacters: { type: Number, default: 0 },
    translatedMessages: { type: Number, default: 0 },
  },
  { timestamps: true },
);

guildStatsHourlySchema.index({ guildId: 1, hourBucket: 1 }, { unique: true });

export const GuildStatsHourly =
  mongoose.models.GuildStatsHourly ||
  mongoose.model("GuildStatsHourly", guildStatsHourlySchema);
