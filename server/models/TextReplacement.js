import mongoose from "mongoose";
import { guildEventsPlugin } from "./eventsPlugin.js";

const textReplacementSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    input: { type: String, required: true },
    output: { type: String, required: true },
  },
  { timestamps: true },
);

textReplacementSchema.index({ guildId: 1, input: 1 }, { unique: true });

textReplacementSchema.plugin(guildEventsPlugin);

export const TextReplacement =
  mongoose.models.TextReplacement ||
  mongoose.model("TextReplacement", textReplacementSchema);
