import mongoose from "mongoose";

const guildSettingsSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    ownerDiscordId: { type: String, default: null },
    plan: {
      type: String,
      enum: ["free", "premium", "pro"],
      default: "free",
    },
    maxCharactersPerDay: { type: Number, default: 10000 },
    enabledModules: {
      autoTranslation: { type: Boolean, default: false },
      roleTranslation: { type: Boolean, default: false },
      flagReactions: { type: Boolean, default: false },
    },
    features: {
      translationByFlagEnabled: { type: Boolean, default: false },
      autoTranslateEnabled: { type: Boolean, default: false },
      roleTranslateEnabled: { type: Boolean, default: false },
      userTranslateEnabled: { type: Boolean, default: false },
      autoEraseEnabled: { type: Boolean, default: false },
      autoReactEnabled: { type: Boolean, default: false },
      ttsEnabled: { type: Boolean, default: false },
    },
    autoEraseMode: {
      type: String,
      enum: ["ONLY_FROM_ORIGINAL", "ONLY_FROM_TRANSLATED", "ALL"],
      default: "ONLY_FROM_ORIGINAL",
    },
    defaultStyle: {
      type: String,
      enum: ["TEXT", "EMBED", "WEBHOOK"],
      default: "TEXT",
    },
  },
  { timestamps: true },
);

export const GuildSettings =
  mongoose.models.GuildSettings ||
  mongoose.model("GuildSettings", guildSettingsSchema);
