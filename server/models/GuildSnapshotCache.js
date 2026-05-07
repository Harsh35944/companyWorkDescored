import mongoose from "mongoose";

const guildSnapshotCacheSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    guildName: { type: String, default: null },
    icon: { type: String, default: null },
    memberCount: { type: Number, default: 0 },
    channelCount: { type: Number, default: 0 },
    categoryCount: { type: Number, default: 0 },
    roleCount: { type: Number, default: 0 },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const GuildSnapshotCache =
  mongoose.models.GuildSnapshotCache ||
  mongoose.model("GuildSnapshotCache", guildSnapshotCacheSchema);
