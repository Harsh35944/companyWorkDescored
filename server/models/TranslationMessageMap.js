import mongoose from "mongoose";

const translationMessageMapSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    featureType: {
      type: String,
      enum: ["AUTO", "ROLE", "FLAG", "COMMAND"],
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

export const TranslationMessageMap =
  mongoose.models.TranslationMessageMap ||
  mongoose.model("TranslationMessageMap", translationMessageMapSchema);
