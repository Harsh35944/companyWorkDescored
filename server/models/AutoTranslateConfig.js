import mongoose from "mongoose";

const targetSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: ["CHANNEL", "THREAD"], default: "CHANNEL" },
    targetId: { type: String, required: true },
    targetLanguage: { type: String, required: true },
  },
  { _id: false },
);

const autoTranslateConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    sourceType: { type: String, enum: ["CHANNEL", "CATEGORY"], default: "CHANNEL" },
    sourceId: { type: String, required: true },
    targets: { type: [targetSchema], default: [] },
    sourceLanguage: { type: String, default: null },
    style: { type: String, enum: ["TEXT", "EMBED", "WEBHOOK"], default: "TEXT" },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

autoTranslateConfigSchema.index({ guildId: 1, name: 1 }, { unique: true });

export const AutoTranslateConfig =
  mongoose.models.AutoTranslateConfig ||
  mongoose.model("AutoTranslateConfig", autoTranslateConfigSchema);
