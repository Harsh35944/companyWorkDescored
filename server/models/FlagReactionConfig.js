import mongoose from "mongoose";
import { guildEventsPlugin } from "./eventsPlugin.js";

const flagReactionConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false },
    style: { type: String, enum: ["TEXT", "EMBED", "WEBHOOK"], default: "TEXT" },
    sendInPm: { type: Boolean, default: false },
    sendInThread: { type: Boolean, default: false },
    autoDisappearSeconds: { type: Number, default: 0 },
  },
  { timestamps: true },
);

flagReactionConfigSchema.plugin(guildEventsPlugin);

export const FlagReactionConfig =
  mongoose.models.FlagReactionConfig ||
  mongoose.model("FlagReactionConfig", flagReactionConfigSchema);
