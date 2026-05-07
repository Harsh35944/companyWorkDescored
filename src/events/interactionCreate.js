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
