import mongoose from "mongoose";

const translateBanSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    userIds: { type: [String], default: [] },
    roleIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const TranslateBan =
  mongoose.models.TranslateBan || mongoose.model("TranslateBan", translateBanSchema);
