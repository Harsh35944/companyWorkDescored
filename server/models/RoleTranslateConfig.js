import mongoose from "mongoose";

const roleTranslateConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    roleId: { type: String, required: true },
    targetLanguage: { type: String, required: true },
    style: { type: String, enum: ["TEXT", "EMBED", "WEBHOOK"], default: "TEXT" },
    enabled: { type: Boolean, default: true },
    deleteOriginal: { type: Boolean, default: false },
    disableMention: { type: Boolean, default: false },
    autoDisappearDelay: { type: Number, default: 0 }, // 0 to disable
    format: { type: String, default: "" },
    sourceLanguage: { type: String, default: null },
    ignoreEmojis: { type: Boolean, default: false },
    ignoreIfSourceIsNotInput: { type: Boolean, default: false },
    ignoreIfSourceIsTarget: { type: Boolean, default: true },
  },
  { timestamps: true },
);

roleTranslateConfigSchema.index({ guildId: 1, roleId: 1 }, { unique: true });

export const RoleTranslateConfig =
  mongoose.models.RoleTranslateConfig ||
  mongoose.model("RoleTranslateConfig", roleTranslateConfigSchema);
