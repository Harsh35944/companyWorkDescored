import mongoose from "mongoose";

const guildInstallationSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    installerDiscordId: { type: String, required: true, index: true },
    installedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const GuildInstallation =
  mongoose.models.GuildInstallation ||
  mongoose.model("GuildInstallation", guildInstallationSchema);
