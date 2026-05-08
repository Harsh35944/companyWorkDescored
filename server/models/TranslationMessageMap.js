import mongoose from "mongoose";

const translationMessageMapSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    featureType: {
      type: String,
      enum: ["AUTO", "ROLE", "FLAG", "COMMAND", "USER"],
      required: true,
    },
    originalMessageId: { type: String, required: true },
    translatedMessageIds: { type: [String], default: [] },
    sourceChannelId: { type: String, default: null },
  },
  { timestamps: true },
);

translationMessageMapSchema.index(
  { guildId: 1, featureType: 1, originalMessageId: 1 },
  { unique: true },
);

// TTL index to delete mappings after 7 days (Parity with iTranslator)
translationMessageMapSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

export const TranslationMessageMap =
  mongoose.models.TranslationMessageMap ||
  mongoose.model("TranslationMessageMap", translationMessageMapSchema);
