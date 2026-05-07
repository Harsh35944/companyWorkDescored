import mongoose from "mongoose";

const userTranslateConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    targetLanguage: { type: String, required: true },
    style: { type: String, enum: ["TEXT", "EMBED", "WEBHOOK"], default: "TEXT" },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userTranslateConfigSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export const UserTranslateConfig =
  mongoose.models.UserTranslateConfig ||
  mongoose.model("UserTranslateConfig", userTranslateConfigSchema);
