import mongoose from "mongoose";
import { guildEventsPlugin } from "./eventsPlugin.js";

const translateBanSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    userIds: { type: [String], default: [] },
    roleIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

translateBanSchema.plugin(guildEventsPlugin);

export const TranslateBan =
  mongoose.models.TranslateBan || mongoose.model("TranslateBan", translateBanSchema);
