import mongoose from "mongoose";

const userStatsDailySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    day: { type: String, required: true },
    translatedCharacters: { type: Number, default: 0 },
    translatedMessages: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userStatsDailySchema.index({ userId: 1, day: 1 }, { unique: true });

export const UserStatsDaily =
  mongoose.models.UserStatsDaily ||
  mongoose.model("UserStatsDaily", userStatsDailySchema);
