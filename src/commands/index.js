import {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  detectLanguage,
  getGuildSettings,
  runCommandTranslation,
  setTranslatedMessageIds,
  translateText,
} from "../services/translationCore.js";

/** Register commands here. Each item is passed to REST.put(Routes.application...). */
export const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Replies with latency."),
    async execute(interaction) {
      const sent = await interaction.reply({
        content: "Pinging…",
        fetchReply: true,
      });
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      await interaction.editReply(
        `Pong. Round-trip: ${latency} ms · WebSocket: ${interaction.client.ws.ping} ms`,
      );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("detect")
      .setDescription("Detect language for given text")
      .addStringOption((o) =>
        o.setName("text").setDescription("Text to detect").setRequired(true),
      ),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "This command works in servers only.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      const text = interaction.options.getString("text", true);
      const detected = await detectLanguage(text);
      await interaction.reply({
        content: `Language: ${detected.language} (confidence ${Math.round(detected.confidence * 100)}%)`,
        flags: [MessageFlags.Ephemeral],
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("translate")
      .setDescription("Translate text")
      .addStringOption((o) =>
        o.setName("text").setDescription("Text to translate").setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("target_language")
          .setDescription("Target language code (en, hi, gu...)")
          .setRequired(true),
      ),
    async execute(interaction) {
      if (!interaction.guildId || !interaction.channelId) {
        await interaction.reply({
          content: "This command works in servers only.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await interaction.deferReply();

      const text = interaction.options.getString("text", true);
      const targetLanguage = interaction.options.getString("target_language", true);

      try {
        const result = await runCommandTranslation({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          originalMessageId: interaction.id,
          sourceChannelId: interaction.channelId,
          featureType: "COMMAND",
          text,
          targetLanguage,
        });

        const components = [];
        const settings = await getGuildSettings(interaction.guildId);
        if (settings?.features?.ttsEnabled) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`tts:${targetLanguage}`)
              .setLabel("Listen")
              .setEmoji("🔊")
              .setStyle(ButtonStyle.Secondary),
          );
          components.push(row);
        }

        const sent = await interaction.editReply({
          content: result.translatedText,
          components,
        });

        await setTranslatedMessageIds({
          guildId: interaction.guildId,
          featureType: "COMMAND",
          originalMessageId: interaction.id,
          translatedMessageIds: [sent.id],
        });
      } catch (err) {
        await interaction.editReply({
          content: `Translation failed: ${err.message}`,
        });
      }
    },
  },
  {
    data: new ContextMenuCommandBuilder()
      .setName("Translate to English")
      .setType(ApplicationCommandType.Message),
    async execute(interaction) {
      await handleContextMenuTranslate(interaction, "en");
    },
  },
  {
    data: new ContextMenuCommandBuilder()
      .setName("Translate to Gujarati")
      .setType(ApplicationCommandType.Message),
    async execute(interaction) {
      await handleContextMenuTranslate(interaction, "gu");
    },
  },
];

async function handleContextMenuTranslate(interaction, targetLang) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const message = interaction.targetMessage;
  const content = message.content;

  if (!content?.trim()) {
    return interaction.editReply("This message has no text to translate.");
  }

  try {
    const res = await translateText(content, null, targetLang);
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`Translation (${res.sourceLanguage} → ${res.targetLanguage})`)
      .setDescription(res.translatedText)
      .setFooter({ text: "Translation Service" });

    const components = [];
    // We can fetch settings here to see if TTS is enabled for the guild
    const { getGuildSettings } = await import("../services/translationCore.js");
    const settings = await getGuildSettings(interaction.guildId);

    if (settings?.features?.ttsEnabled) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`tts:${targetLang}`)
          .setLabel("Listen")
          .setEmoji("🔊")
          .setStyle(ButtonStyle.Secondary),
      );
      components.push(row);
    }

    await interaction.editReply({ embeds: [embed], components });
  } catch (err) {
    await interaction.editReply(`Translation failed: ${err.message}`);
  }
}
