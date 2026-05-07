import mongoose from "mongoose";

const textReplacementSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    input: { type: String, required: true },
    output: { type: String, required: true },
  },
  { timestamps: true },
);

textReplacementSchema.index({ guildId: 1, input: 1 }, { unique: true });

export const TextReplacement =
  mongoose.models.TextReplacement ||
  mongoose.model("TextReplacement", textReplacementSchema);
