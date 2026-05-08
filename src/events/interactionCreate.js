import { Events, MessageFlags } from "discord.js";
import { commands } from "../commands/index.js";
import { logger } from "../utils/logger.js";
import { generateTTSUrl } from "../services/ttsService.js";

const byName = new Map(commands.map((c) => [c.data.name, c]));

export const interactionCreateEvent = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand()) {
      const command = byName.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (err) {
        logger.error("Command failed", {
          command: interaction.commandName,
          error: err instanceof Error ? err.message : String(err),
        });

        const payload = {
          content: "Something went wrong running this command.",
          flags: [MessageFlags.Ephemeral],
        };

        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
          } else {
            await interaction.reply(payload);
          }
        } catch (replyErr) {
          logger.warn("Failed to send error reply", { error: replyErr.message });
        }
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("export_csv:")) {
        const [, type, period, contextId] = interaction.customId.split(":");
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const { GuildStatsDaily } = await import("../../server/models/GuildStatsDaily.js");
        const { GuildStatsHourly } = await import("../../server/models/GuildStatsHourly.js");
        const { AttachmentBuilder } = await import("discord.js");
        const fs = await import("fs");
        const path = await import("path");

        let data = [];
        let filename = `stats_${interaction.guildId}_${type}_${period}.csv`;
        let csvContent = "Timestamp,Value\n";

        if (period === "24h") {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
          data = await GuildStatsHourly.find({
            guildId: interaction.guildId,
            contextId,
            hourBucket: { $gte: since },
          }).sort({ hourBucket: 1 });
          
          data.forEach(item => {
            const val = type === "TRANSLATED_MESSAGES" ? item.translatedMessages : item.translatedCharacters;
            csvContent += `${item.hourBucket.toISOString()},${val}\n`;
          });
        } else {
          const days = period === "7d" ? 7 : 30;
          const dayStrings = [];
          for (let i = 0; i < days; i++) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            dayStrings.push(d.toISOString().split("T")[0]);
          }
          data = await GuildStatsDaily.find({
            guildId: interaction.guildId,
            contextId,
            day: { $in: dayStrings },
          }).sort({ day: 1 });

          data.forEach(item => {
            const val = type === "TRANSLATED_MESSAGES" ? item.translatedMessages : item.translatedCharacters;
            csvContent += `${item.day},${val}\n`;
          });
        }

        const tempDir = path.join(process.cwd(), "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
        const filePath = path.join(tempDir, filename);
        fs.writeFileSync(filePath, csvContent);

        const attachment = new AttachmentBuilder(filePath);
        await interaction.editReply({
          content: "📊 Your statistics export is ready!",
          files: [attachment],
        });

        // Clean up
        setTimeout(() => {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }, 60000);
        return;
      }

      if (interaction.customId.startsWith("tts:")) {
        const lang = interaction.customId.split(":")[1];
        let text = interaction.message.content;
        if (!text && interaction.message.embeds.length > 0) {
          text = interaction.message.embeds[0].description;
        }

        if (!text) {
          return interaction.reply({
            content: "Could not find text to speak.",
            flags: [MessageFlags.Ephemeral],
          });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const url = await generateTTSUrl(text, lang);
        if (!url) {
          return interaction.editReply("Failed to generate audio.");
        }

        await interaction.editReply({
          content: `Here is the audio for the translation (${lang}):\n${url}`,
        });
      }
    }
  },
};
