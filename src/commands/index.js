import {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  AttachmentBuilder,
} from "discord.js";
import fs from "fs";
import path from "path";
import { GuildStatsDaily } from "../../server/models/GuildStatsDaily.js";
import { GuildStatsHourly } from "../../server/models/GuildStatsHourly.js";
import { UserGuildStats } from "../../server/models/UserGuildStats.js";
import {
  detectLanguage,
  getGuildSettings,
  updateGuildSettings,
  runCommandTranslation,
  saveTranslationMap,
  setTranslatedMessageIds,
  translateText,
} from "../services/translationCore.js";
import { SUPPORTED_LANGUAGES } from "../utils/languages.js";
import { AutoTranslateConfig } from "../../server/models/AutoTranslateConfig.js";
import { RoleTranslateConfig } from "../../server/models/RoleTranslateConfig.js";
import { TranslateBan } from "../../server/models/TranslateBan.js";

const LANGUAGE_NAMES = SUPPORTED_LANGUAGES.reduce((acc, l) => {
  acc[l.code] = l.name;
  return acc;
}, {});

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
      const langName = LANGUAGE_NAMES[detected.language] || detected.language;
      await interaction.reply({
        content: `Detected Language: **${langName}** (Code: \`${detected.language}\`, Confidence: ${Math.round(detected.confidence * 100)}%)`,
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
  {
    data: new ContextMenuCommandBuilder()
      .setName("Translate to My Language")
      .setType(ApplicationCommandType.Message),
    async execute(interaction) {
      const UserTranslateConfig = (await import("../../server/models/UserTranslateConfig.js")).UserTranslateConfig;
      const cfg = await UserTranslateConfig.findOne({ guildId: interaction.guildId, userId: interaction.user.id });
      const targetLang = cfg?.targetLanguage || "en"; // Default to English if not set
      await handleContextMenuTranslate(interaction, targetLang);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("autotranslate")
      .setDescription("Manage automatic translation configurations")
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription("Create a new auto-translate config")
          .addStringOption((o) => o.setName("name").setDescription("Unique name").setRequired(true))
          .addChannelOption((o) => o.setName("source").setDescription("Source channel").setRequired(true))
          .addChannelOption((o) => o.setName("target").setDescription("Target channel").setRequired(true))
          .addStringOption((o) => o.setName("language").setDescription("Target language code (e.g. gu, hi, en)").setRequired(true))
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List all auto-translate configs")
      )
      .addSubcommand((sub) =>
        sub
          .setName("toggle")
          .setDescription("Enable or disable the global auto-translate system")
          .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("Delete a config by name")
          .addStringOption((o) => o.setName("name").setDescription("Name of the config").setRequired(true))
      )
      .addSubcommandGroup((group) =>
        group
          .setName("config")
          .setDescription("Configure specific settings for an auto-translate rule")
          .addSubcommand((sub) =>
            sub
              .setName("style")
              .setDescription("Set the style of translations")
              .addStringOption((o) => o.setName("name").setDescription("Config name").setRequired(true))
              .addStringOption((o) => o.setName("style").setDescription("TEXT, EMBED, or WEBHOOK").setRequired(true).addChoices(
                { name: "Text", value: "TEXT" },
                { name: "Embed", value: "EMBED" },
                { name: "Webhook", value: "WEBHOOK" }
              ))
          )
          .addSubcommand((sub) =>
            sub
              .setName("auto-disappear")
              .setDescription("Set auto-disappear delay")
              .addStringOption((o) => o.setName("name").setDescription("Config name").setRequired(true))
              .addIntegerOption((o) => o.setName("delay").setDescription("Delay in seconds (0 to disable)").setRequired(true))
          )
          .addSubcommand((sub) =>
            sub
              .setName("delete-original")
              .setDescription("Set if original messages should be deleted")
              .addStringOption((o) => o.setName("name").setDescription("Config name").setRequired(true))
              .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
          )
          .addSubcommand((sub) =>
            sub
              .setName("disable-mention")
              .setDescription("Set if mentions should be disabled")
              .addStringOption((o) => o.setName("name").setDescription("Config name").setRequired(true))
              .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
          )
          .addSubcommand((sub) =>
            sub
              .setName("ignore-emojis")
              .setDescription("Ignore emoji-only messages")
              .addStringOption((o) => o.setName("name").setDescription("Config name").setRequired(true))
              .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
          )
          .addSubcommand((sub) =>
            sub
              .setName("ignore-if-source-is-not-input")
              .setDescription("Ignore if source language is not respected")
              .addStringOption((o) => o.setName("name").setDescription("Config name").setRequired(true))
              .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
          )
          .addSubcommand((sub) =>
            sub
              .setName("ignore-if-source-is-target")
              .setDescription("Ignore if source equals target language")
              .addStringOption((o) => o.setName("name").setDescription("Config name").setRequired(true))
              .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
          )
          .addSubcommand((sub) =>
            sub
              .setName("language-add-target")
              .setDescription("Add a target language")
              .addStringOption((o) => o.setName("name").setDescription("Config name").setRequired(true))
              .addStringOption((o) => o.setName("language").setDescription("Language code").setRequired(true))
              .addChannelOption((o) => o.setName("channel").setDescription("Target channel").setRequired(true))
          )
          .addSubcommand((sub) =>
            sub
              .setName("language-clearsource")
              .setDescription("Clear the source language (Auto-detect)")
              .addStringOption((o) => o.setName("name").setDescription("Config name").setRequired(true))
          )
          .addSubcommand((sub) =>
            sub
              .setName("channel-source")
              .setDescription("Set the source channel")
              .addStringOption((o) => o.setName("name").setDescription("Config name").setRequired(true))
              .addChannelOption((o) => o.setName("channel").setDescription("New source channel").setRequired(true))
          )
          .addSubcommand((sub) =>
            sub
              .setName("channel-target")
              .setDescription("Set the target channel")
              .addStringOption((o) => o.setName("name").setDescription("Config name").setRequired(true))
              .addChannelOption((o) => o.setName("channel").setDescription("New target channel").setRequired(true))
          )
          .addSubcommand((sub) =>
            sub
              .setName("format")
              .setDescription("Set the format of translations")
              .addStringOption((o) => o.setName("name").setDescription("Config name").setRequired(true))
              .addStringOption((o) => o.setName("format").setDescription("Custom format string").setRequired(true))
          )
      )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
  if (!interaction.guildId) return interaction.reply("Servers only.");
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    const name = interaction.options.getString("name", true);
    const source = interaction.options.getChannel("source", true);
    const target = interaction.options.getChannel("target", true);
    const lang = interaction.options.getString("language", true).toLowerCase();

    try {
      await AutoTranslateConfig.create({
        guildId: interaction.guildId,
        name,
        sourceId: source.id,
        targets: [{ targetId: target.id, targetLanguage: lang }],
      });
      await interaction.reply(`✅ Created config **${name}**: #${source.name} ➔ ${lang} (#${target.name})`);
    } catch (err) {
      await interaction.reply(`❌ Failed to create: ${err.message}`);
    }
  } else if (sub === "list") {
    const configs = await AutoTranslateConfig.find({ guildId: interaction.guildId });
    if (!configs.length) return interaction.reply("No configurations found.");
    const list = configs.map(c => `• **${c.name}**: <#${c.sourceId}> ➔ ${c.targets.map(t => `${t.targetLanguage} (<#${t.targetId}>)`).join(", ")}`).join("\n");
    await interaction.reply(`**Auto-Translate Configurations:**\n${list}`);
  } else if (sub === "toggle") {
    const enabled = interaction.options.getBoolean("enabled", true);
    await updateGuildSettings(interaction.guildId, { "features.autoTranslateEnabled": enabled });
    await interaction.reply(`✅ Global Auto-Translate system set to: **${enabled}**`);
  } else if (sub === "delete") {
    const name = interaction.options.getString("name", true);
    const res = await AutoTranslateConfig.deleteOne({ guildId: interaction.guildId, name });
    if (res.deletedCount > 0) {
      await interaction.reply(`✅ Deleted config **${name}**.`);
    } else {
      await interaction.reply(`❌ Config **${name}** not found.`);
    }
  } else {
    // Handle subcommand groups (config)
    const group = interaction.options.getSubcommandGroup();
    if (group === "config") {
      const configName = interaction.options.getString("name", true);
      const cfg = await AutoTranslateConfig.findOne({ guildId: interaction.guildId, name: configName });
      if (!cfg) return interaction.reply(`❌ Config **${configName}** not found.`);

      if (sub === "style") {
        const style = interaction.options.getString("style", true);
        cfg.style = style;
        await cfg.save();
        await interaction.reply(`✅ Style for **${configName}** updated to **${style}**.`);
      } else if (sub === "auto-disappear") {
        const delay = interaction.options.getInteger("delay", true);
        cfg.autoDisappearDelay = delay;
        await cfg.save();
        await interaction.reply(`✅ Auto-disappear for **${configName}** set to **${delay}**s.`);
      } else if (sub === "delete-original") {
        const enabled = interaction.options.getBoolean("enabled", true);
        cfg.deleteOriginal = enabled;
        await cfg.save();
        await interaction.reply(`✅ Delete original for **${configName}** set to **${enabled}**.`);
      } else if (sub === "disable-mention") {
        const enabled = interaction.options.getBoolean("enabled", true);
        cfg.disableMention = enabled;
        await cfg.save();
        await interaction.reply(`✅ Disable mention for **${configName}** set to **${enabled}**.`);
      } else if (sub === "ignore-emojis") {
        const enabled = interaction.options.getBoolean("enabled", true);
        cfg.ignoreEmojis = enabled;
        await cfg.save();
        await interaction.reply(`✅ Ignore emojis for **${configName}** set to **${enabled}**.`);
      } else if (sub === "ignore-if-source-is-not-input") {
        const enabled = interaction.options.getBoolean("enabled", true);
        cfg.ignoreIfSourceIsNotInput = enabled;
        await cfg.save();
        await interaction.reply(`✅ Ignore if source is not input for **${configName}** set to **${enabled}**.`);
      } else if (sub === "ignore-if-source-is-target") {
        const enabled = interaction.options.getBoolean("enabled", true);
        cfg.ignoreIfSourceIsTarget = enabled;
        await cfg.save();
        await interaction.reply(`✅ Ignore if source is target for **${configName}** set to **${enabled}**.`);
      } else if (sub === "language-add-target") {
        const lang = interaction.options.getString("language", true).toLowerCase();
        const channel = interaction.options.getChannel("channel", true);
        cfg.targets.push({ targetId: channel.id, targetLanguage: lang, targetType: "CHANNEL" });
        await cfg.save();
        await interaction.reply(`✅ Added target **${lang}** (<#${channel.id}>) to **${configName}**.`);
      } else if (sub === "language-clearsource") {
        cfg.sourceLanguage = null;
        await cfg.save();
        await interaction.reply(`✅ Source language for **${configName}** cleared (Auto-detect ON).`);
      } else if (sub === "channel-source") {
        const channel = interaction.options.getChannel("channel", true);
        cfg.sourceId = channel.id;
        await cfg.save();
        await interaction.reply(`✅ Source channel for **${configName}** set to <#${channel.id}>.`);
      } else if (sub === "channel-target") {
        const channel = interaction.options.getChannel("channel", true);
        // Note: For simplicity, this updates the FIRST target. 
        // Real-world might need target selection if multiple exist.
        if (cfg.targets.length > 0) {
          cfg.targets[0].targetId = channel.id;
          await cfg.save();
          await interaction.reply(`✅ Target channel for **${configName}** set to <#${channel.id}>.`);
        } else {
          await interaction.reply(`❌ No targets found for **${configName}** to update.`);
        }
      } else if (sub === "format") {
        const format = interaction.options.getString("format", true);
        cfg.format = format;
        await cfg.save();
        await interaction.reply(`✅ Format for **${configName}** set to: \`${format}\``);
      }
    }
    }
  }
},
{
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Display help message and list of commands"),
    async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("Help & Commands")
      .setDescription("Welcome to the Translation Bot! Here are the available commands:")
      .addFields(
        { name: "🔍 Detection", value: "`/detect <text>` - Identify language\n`Apps > Detect Language` - Right-click context command", inline: false },
        { name: "🌐 Translation", value: "`/translate <text> <language>` - Manual translation\n`Apps > Translate to English` - Right-click context command\n`Apps > Translate to Gujarati` - Right-click context command", inline: false },
        { name: "🚀 Automatic", value: "`/autotranslate create` - Set up auto-translation\n`/autotranslate list` - View active rules\n`/autotranslate delete` - Remove a rule", inline: false },
        { name: "📊 Statistics", value: "`/stats` - View server translation activity", inline: false },
        { name: "⚙️ Other", value: "`/help` - This message\n`/about` - Bot info\n`/languages` - List supported languages", inline: false },
        { name: "🔗 Useful Links", value: "[Dashboard](http://localhost:3000) • [Documentation](https://docs.itranslator.app) • [Support](https://discord.gg/example)", inline: false }
      );
    await interaction.reply({ embeds: [embed] });
  },
},
{
  data: new SlashCommandBuilder()
    .setName("about")
    .setDescription("Information about this bot and server"),
    async execute(interaction) {
    const guild = interaction.guild;
    const embed = new EmbedBuilder()
      .setColor(0xffaa00)
      .setTitle("About Translation Bot")
      .setDescription("A premium multi-language translation bot for Discord.")
      .addFields(
        { name: "Bot Version", value: "1.0.0", inline: true },
        { name: "Platform", value: "Discord.js v14", inline: true },
        { name: "Server", value: guild ? guild.name : "Direct Message", inline: true },
        { name: "Total Members", value: guild ? guild.memberCount.toString() : "N/A", inline: true }
      )
      .setFooter({ text: "Crafted for global communication" });
    await interaction.reply({ embeds: [embed] });
  },
},
{
  data: new SlashCommandBuilder()
    .setName("languages")
    .setDescription("Display all supported languages"),
    async execute(interaction) {
    // Chunk the language list to avoid embed limits
    const langList = SUPPORTED_LANGUAGES.map(l => `\`${l.code}\`: ${l.name}`).join(", ");
    const chunks = langList.match(/.{1,1000}(\s|,|$)/g) || [];

    const embeds = chunks.map((chunk, i) =>
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(i === 0 ? "🌍 Supported Languages" : "🌍 Supported Languages (Continued)")
        .setDescription(chunk)
    );

    await interaction.reply({ embeds: [embeds[0]], flags: [MessageFlags.Ephemeral] });
    for (let i = 1; i < embeds.length; i++) {
      await interaction.followUp({ embeds: [embeds[i]], flags: [MessageFlags.Ephemeral] });
    }
  },
},
{
  data: new SlashCommandBuilder()
    .setName("vote")
    .setDescription("Vote for the bot to get unlimited translations"),
    async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x7289da)
      .setTitle("🗳️ Vote for Translation Bot")
      .setDescription("Support us by voting! Each vote grants you **unlimited translations** for 12 hours.")
      .addFields({ name: "Voting Link", value: "[Click here to vote on Top.gg](https://top.gg/bot/example/vote)" })
      .setFooter({ text: "Thank you for your support!" });
    await interaction.reply({ embeds: [embed] });
  },
},
{
  data: new SlashCommandBuilder()
    .setName("checkvote")
    .setDescription("Check your current vote status and usage limits"),
    async execute(interaction) {
    // Mocking vote status for now
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("✅ Vote Status")
      .setDescription("You have active vote benefits! Your limits are currently lifted.")
      .addFields(
        { name: "Vote Expiry", value: "In 8 hours", inline: true },
        { name: "Current Usage", value: "2,450 / Unlimited", inline: true }
      );
    await interaction.reply({ embeds: [embed] });
  },
},
  {
    data: new SlashCommandBuilder()
      .setName("autoerase")
      .setDescription("Manage Auto-Erase settings")
      .addSubcommand((s) =>
        s
          .setName("toggle")
          .setDescription("Toggle the Auto-Erase feature")
          .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("mode")
          .setDescription("Change the erase mode")
          .addStringOption((o) => o.setName("mode").setDescription("Choose erase mode").setRequired(true).addChoices(
            { name: "Only Original (If original is deleted, translated is too)", value: "ONLY_FROM_ORIGINAL" },
            { name: "Only Translated (If translated is deleted, original is too)", value: "ONLY_FROM_TRANSLATED" },
            { name: "All (Any deletion triggers both)", value: "ALL" }
          ))
      )
      .addSubcommand((s) =>
        s
          .setName("delay")
          .setDescription("Set the auto-erase delay in seconds")
          .addIntegerOption((o) => o.setName("seconds").setDescription("Delay in seconds (default 30)").setRequired(true).setMinValue(1).setMaxValue(3600))
      )
      .addSubcommand((s) => s.setName("help").setDescription("Show help for Auto-Erase"))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return interaction.reply("Servers only.");
      const sub = interaction.options.getSubcommand();

      if (sub === "help") {
        return interaction.reply("**Auto-Erase Help:**\nAuto-Erase ensures that if you delete a message (or its translation), the other one is automatically removed as well. This keeps your channels clean!");
      }

      if (sub === "toggle") {
        const enabled = interaction.options.getBoolean("enabled", true);
        await updateGuildSettings(interaction.guildId, { "features.autoEraseEnabled": enabled });
        await interaction.reply(`✅ Auto-Erase feature set to: **${enabled}**`);
      } else if (sub === "mode") {
        const mode = interaction.options.getString("mode", true);
        await updateGuildSettings(interaction.guildId, { "autoEraseMode": mode });
        await interaction.reply(`✅ Auto-Erase mode set to: **${mode}**`);
      } else if (sub === "delay") {
        const seconds = interaction.options.getInteger("seconds", true);
        await updateGuildSettings(interaction.guildId, { "autoEraseDelay": seconds });
        await interaction.reply(`✅ Auto-Erase delay set to: **${seconds}** seconds.`);
      }
    },
  },
{
  data: new SlashCommandBuilder()
    .setName("autoreact")
    .setDescription("Manage Auto-React settings")
    .addBooleanOption(o => o.setName("enabled").setDescription("Enable or disable"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
    const enabled = interaction.options.getBoolean("enabled");
    const settings = await getGuildSettings(interaction.guildId);
    const current = Boolean(settings?.features?.autoReactEnabled);

    if (enabled !== null) {
      updateGuildSettings(interaction.guildId, { "features.autoReactEnabled": enabled }).catch(console.error);
      await interaction.reply(`✅ Auto-React feature set to: **${enabled}**`);
    } else {
      await interaction.reply(`Auto-React adds a flag emoji to messages to show their detected language. Current Status: **${current ? "Enabled ✅" : "Disabled ❌"}**`);
    }
  },
},
  {
    data: new SlashCommandBuilder()
      .setName("text-replacement")
      .setDescription("Manage Text-Replacement settings")
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription("Add a new text replacement")
          .addStringOption((o) => o.setName("input").setDescription("Text to find").setRequired(true))
          .addStringOption((o) => o.setName("output").setDescription("Replacement text").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("remove")
          .setDescription("Remove an existing text replacement")
          .addStringOption((o) => o.setName("input").setDescription("The input text to remove").setRequired(true))
      )
      .addSubcommand((s) => s.setName("list").setDescription("List all configured text replacements"))
      .addSubcommand((s) => s.setName("help").setDescription("Show help for Text-Replacement"))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return interaction.reply("Servers only.");
      const sub = interaction.options.getSubcommand();
      const TextReplacement = (await import("../../server/models/TextReplacement.js")).TextReplacement;

      if (sub === "help") {
        return interaction.reply("**Text-Replacement Help:**\nUse this to fix recurring translation mistakes. For example, if 'Bot' is translated wrong, you can force it to stay 'Bot'!");
      }

      if (sub === "add") {
        const input = interaction.options.getString("input", true);
        const output = interaction.options.getString("output", true);
        await TextReplacement.findOneAndUpdate(
          { guildId: interaction.guildId, input },
          { output },
          { upsert: true }
        );
        await interaction.reply(`✅ Added replacement: \`${input}\` ➔ \`${output}\``);
      } else if (sub === "remove") {
        const input = interaction.options.getString("input", true);
        const res = await TextReplacement.deleteOne({ guildId: interaction.guildId, input });
        if (res.deletedCount > 0) {
          await interaction.reply(`✅ Removed replacement for \`${input}\`.`);
        } else {
          await interaction.reply(`❌ Replacement for \`${input}\` not found.`);
        }
      } else if (sub === "list") {
        const list = await TextReplacement.find({ guildId: interaction.guildId });
        if (!list.length) return interaction.reply("No text replacements configured.");
        const text = list.map((r) => `• \`${r.input}\` ➔ \`${r.output}\``).join("\n");
        await interaction.reply(`**Text-Replacements:**\n${text}`);
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("conversation-mode")
      .setDescription("Manage Conversation Mode settings")
      .addSubcommand((s) =>
        s
          .setName("delay")
          .setDescription("Set the batch delay for grouped messages")
          .addIntegerOption((o) => o.setName("ms").setDescription("Delay in milliseconds (default 2000)").setRequired(true))
      )
      .addSubcommand((s) => s.setName("help").setDescription("Show help for conversation mode"))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return interaction.reply("Servers only.");
      const sub = interaction.options.getSubcommand();

      if (sub === "help") {
        return interaction.reply("**Conversation Mode Help:**\nWhen enabled, the bot waits a few seconds to collect multiple messages before translating them all at once. This makes the conversation feel more natural and less spammy!");
      }

      if (sub === "delay") {
        const ms = interaction.options.getInteger("ms", true);
        await updateGuildSettings(interaction.guildId, { "conversationModeDelay": ms });
        await interaction.reply(`✅ Conversation Mode delay set to **${ms}ms**.`);
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("flagreaction")
      .setDescription("Manage the Flag-Reaction feature")
      .addSubcommand((s) =>
        s
          .setName("toggle")
          .setDescription("Toggle the Flag-Reaction feature")
          .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
      )
      .addSubcommandGroup((g) =>
        g
          .setName("config")
          .setDescription("Configure advanced settings for Flag-Reaction")
          .addSubcommand((s) =>
            s
              .setName("auto-disappear")
              .setDescription("Set the auto-disappear delay for translated messages")
              .addIntegerOption((o) => o.setName("delay").setDescription("Delay in seconds (0 to disable)").setRequired(true))
          )
          .addSubcommand((s) =>
            s
              .setName("send-in-pm")
              .setDescription("Set if translations should be sent in PM")
              .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
          )
          .addSubcommand((s) =>
            s
              .setName("send-in-thread")
              .setDescription("Set if translations should be sent in a thread")
              .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
          )
          .addSubcommand((s) =>
            s
              .setName("style")
              .setDescription("Set the style of the translations")
              .addStringOption((o) => o.setName("style").setDescription("TEXT or EMBED").setRequired(true).addChoices(
                { name: "Text", value: "TEXT" },
                { name: "Embed", value: "EMBED" }
              ))
          )
      )
      .addSubcommand((s) => s.setName("help").setDescription("Show help for Flag-Reaction"))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return interaction.reply("Servers only.");
      const group = interaction.options.getSubcommandGroup();
      const sub = interaction.options.getSubcommand();

      if (sub === "help") {
        return interaction.reply("**Flag-Reaction Help:**\nReact to any message with a flag emoji (🇺🇸, 🇮🇳, etc.) and the bot will translate the message for you!");
      }

      if (sub === "toggle") {
        const enabled = interaction.options.getBoolean("enabled", true);
        await updateGuildSettings(interaction.guildId, { "features.translationByFlagEnabled": enabled });
        await interaction.reply(`✅ Flag-Reaction feature set to: **${enabled}**`);
        return;
      }

      if (group === "config") {
        const FlagReactionConfig = (await import("../../server/models/FlagReactionConfig.js")).FlagReactionConfig;
        let cfg = await FlagReactionConfig.findOne({ guildId: interaction.guildId });
        if (!cfg) cfg = new FlagReactionConfig({ guildId: interaction.guildId });

        if (sub === "auto-disappear") {
          const delay = interaction.options.getInteger("delay", true);
          cfg.autoDisappearSeconds = delay;
          await cfg.save();
          await interaction.reply(`✅ Auto-disappear delay set to **${delay}** seconds.`);
        } else if (sub === "send-in-pm") {
          const enabled = interaction.options.getBoolean("enabled", true);
          cfg.sendInPm = enabled;
          await cfg.save();
          await interaction.reply(`✅ Send in PM set to **${enabled}**.`);
        } else if (sub === "send-in-thread") {
          const enabled = interaction.options.getBoolean("enabled", true);
          cfg.sendInThread = enabled;
          await cfg.save();
          await interaction.reply(`✅ Send in thread set to **${enabled}**.`);
        } else if (sub === "style") {
          const style = interaction.options.getString("style", true);
          cfg.style = style;
          await cfg.save();
          await interaction.reply(`✅ Translation style set to **${style}**.`);
        }
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("translaterole")
      .setDescription("Configure the role-translation system")
      .addSubcommand((s) =>
        s
          .setName("create")
          .setDescription("Add a role-based translation rule")
          .addRoleOption((o) => o.setName("role").setDescription("Role to translate").setRequired(true))
          .addStringOption((o) => o.setName("language").setDescription("Target language code").setRequired(true))
      )
      .addSubcommand((s) => s.setName("list").setDescription("List all role-translation rules"))
      .addSubcommand((s) =>
        s
          .setName("delete")
          .setDescription("Remove a role-translation rule")
          .addRoleOption((o) => o.setName("role").setDescription("Role to remove").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("toggle")
          .setDescription("Enable or disable the role-translation system")
          .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
      )
      .addSubcommandGroup((g) =>
        g
          .setName("config")
          .setDescription("Configure advanced settings for a role")
          .addSubcommand((s) =>
            s
              .setName("add-language")
              .setDescription("Add a language to the role configuration")
              .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
              .addStringOption((o) => o.setName("language").setDescription("Language code").setRequired(true))
          )
          .addSubcommand((s) =>
            s
              .setName("auto-disappear")
              .setDescription("Config the delay for auto-deletion (0 to disable)")
              .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
              .addIntegerOption((o) => o.setName("delay").setDescription("Delay in seconds").setRequired(true))
          )
          .addSubcommand((s) =>
            s
              .setName("delete-original")
              .setDescription("Set if the original message should be deleted")
              .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
              .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
          )
          .addSubcommand((s) =>
            s
              .setName("disable-mention")
              .setDescription("Set if mention is allowed or not")
              .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
              .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
          )
          .addSubcommand((s) =>
            s
              .setName("style")
              .setDescription("Set the format/style of the translation")
              .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
              .addStringOption((o) => o.setName("style").setDescription("TEXT, EMBED, or WEBHOOK").setRequired(true).addChoices(
                { name: "Text", value: "TEXT" },
                { name: "Embed", value: "EMBED" },
                { name: "Webhook", value: "WEBHOOK" }
              ))
          )
          .addSubcommand((s) =>
            s
              .setName("ignore-emojis")
              .setDescription("Ignore emoji-only messages")
              .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
              .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
          )
          .addSubcommand((s) =>
            s
              .setName("ignore-if-source-is-not-input")
              .setDescription("Ignore if source language is not respected")
              .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
              .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
          )
          .addSubcommand((s) =>
            s
              .setName("ignore-if-source-is-target")
              .setDescription("Ignore if source equals target language")
              .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
              .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
          )
          .addSubcommand((s) =>
            s
              .setName("language-clearsource")
              .setDescription("Remove the source language (Auto-detect ON)")
              .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
          )
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return interaction.reply("Servers only.");
      const group = interaction.options.getSubcommandGroup();
      const sub = interaction.options.getSubcommand();

      if (sub === "create") {
        const role = interaction.options.getRole("role", true);
        const lang = interaction.options.getString("language", true).toLowerCase();
        try {
          await RoleTranslateConfig.findOneAndUpdate(
            { guildId: interaction.guildId, roleId: role.id },
            { targetLanguage: lang, enabled: true },
            { upsert: true, new: true }
          );
          await interaction.reply(`✅ Messages from **${role.name}** will now be translated to **${lang}**.`);
        } catch (err) {
          await interaction.reply(`❌ Failed to create: ${err.message}`);
        }
      } else if (sub === "list") {
        const configs = await RoleTranslateConfig.find({ guildId: interaction.guildId });
        if (!configs.length) return interaction.reply("No role-translation rules found.");
        const list = configs.map(c => `• <@&${c.roleId}> ➔ **${c.targetLanguage}** (${c.enabled ? "Active" : "Disabled"})`).join("\n");
        await interaction.reply(`**Role-Translation Rules:**\n${list}`);
      } else if (sub === "delete") {
        const role = interaction.options.getRole("role", true);
        const res = await RoleTranslateConfig.deleteOne({ guildId: interaction.guildId, roleId: role.id });
        if (res.deletedCount > 0) {
          await interaction.reply(`✅ Removed translation rule for **${role.name}**.`);
        } else {
          await interaction.reply(`❌ Rule for **${role.name}** not found.`);
        }
      } else if (sub === "toggle") {
        const enabled = interaction.options.getBoolean("enabled", true);
        await updateGuildSettings(interaction.guildId, { "features.roleTranslateEnabled": enabled });
        await interaction.reply(`✅ Role-Translation system set to: **${enabled}**`);
      } else if (group === "config") {
        const role = interaction.options.getRole("role", true);
        const cfg = await RoleTranslateConfig.findOne({ guildId: interaction.guildId, roleId: role.id });
        if (!cfg) return interaction.reply(`❌ Configuration for role **${role.name}** not found.`);

        if (sub === "add-language") {
          const lang = interaction.options.getString("language", true).toLowerCase();
          cfg.targetLanguage = lang;
          await cfg.save();
          await interaction.reply(`✅ Target language for role **${role.name}** has been updated to **${lang}**.`);
        } else if (sub === "auto-disappear") {
          const delay = interaction.options.getInteger("delay", true);
          cfg.autoDisappearDelay = delay;
          await cfg.save();
          await interaction.reply(`✅ Auto-disappear delay for **${role.name}** set to **${delay}** seconds.`);
        } else if (sub === "delete-original") {
          const enabled = interaction.options.getBoolean("enabled", true);
          cfg.deleteOriginal = enabled;
          await cfg.save();
          await interaction.reply(`✅ Delete original message for **${role.name}** set to **${enabled}**.`);
        } else if (sub === "disable-mention") {
          const enabled = interaction.options.getBoolean("enabled", true);
          cfg.disableMention = enabled;
          await cfg.save();
          await interaction.reply(`✅ Disable mention for **${role.name}** set to **${enabled}**.`);
        } else if (sub === "style") {
          const style = interaction.options.getString("style", true);
          cfg.style = style;
          await cfg.save();
          await interaction.reply(`✅ Translation style for **${role.name}** set to **${style}**.`);
        } else if (sub === "ignore-emojis") {
          const enabled = interaction.options.getBoolean("enabled", true);
          cfg.ignoreEmojis = enabled;
          await cfg.save();
          await interaction.reply(`✅ Ignore emojis for **${role.name}** set to **${enabled}**.`);
        } else if (sub === "ignore-if-source-is-not-input") {
          const enabled = interaction.options.getBoolean("enabled", true);
          cfg.ignoreIfSourceIsNotInput = enabled;
          await cfg.save();
          await interaction.reply(`✅ Ignore if source is not input for **${role.name}** set to **${enabled}**.`);
        } else if (sub === "ignore-if-source-is-target") {
          const enabled = interaction.options.getBoolean("enabled", true);
          cfg.ignoreIfSourceIsTarget = enabled;
          await cfg.save();
          await interaction.reply(`✅ Ignore if source is target for **${role.name}** set to **${enabled}**.`);
        } else if (sub === "language-clearsource") {
          cfg.sourceLanguage = null;
          await cfg.save();
          await interaction.reply(`✅ Source language for **${role.name}** cleared (Auto-detect ON).`);
        }
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("translate-ban")
      .setDescription("Ban users & roles from using translation features")
      .addSubcommandGroup((g) =>
        g
          .setName("user")
          .setDescription("Manage user bans")
          .addSubcommand((s) =>
            s
              .setName("ban")
              .setDescription("Ban a user")
              .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
          )
          .addSubcommand((s) =>
            s
              .setName("unban")
              .setDescription("Unban a user")
              .addUserOption((o) => o.setName("user").setDescription("User to unban").setRequired(true))
          )
          .addSubcommand((s) => s.setName("list").setDescription("List banned users"))
      )
      .addSubcommandGroup((g) =>
        g
          .setName("role")
          .setDescription("Manage role bans")
          .addSubcommand((s) =>
            s
              .setName("ban")
              .setDescription("Ban a role")
              .addRoleOption((o) => o.setName("role").setDescription("Role to ban").setRequired(true))
          )
          .addSubcommand((s) =>
            s
              .setName("unban")
              .setDescription("Unban a role")
              .addRoleOption((o) => o.setName("role").setDescription("Role to unban").setRequired(true))
          )
          .addSubcommand((s) => s.setName("list").setDescription("List banned roles"))
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return interaction.reply("Servers only.");
      const group = interaction.options.getSubcommandGroup();
      const sub = interaction.options.getSubcommand();

      let banDoc = await TranslateBan.findOne({ guildId: interaction.guildId });
      if (!banDoc) banDoc = new TranslateBan({ guildId: interaction.guildId });

      if (group === "user") {
        if (sub === "ban") {
          const user = interaction.options.getUser("user", true);
          if (!banDoc.userIds.includes(user.id)) {
            banDoc.userIds.push(user.id);
            await banDoc.save();
          }
          await interaction.reply(`🚫 **${user.tag}** has been banned from translation features.`);
        } else if (sub === "unban") {
          const user = interaction.options.getUser("user", true);
          banDoc.userIds = banDoc.userIds.filter((id) => id !== user.id);
          await banDoc.save();
          await interaction.reply(`✅ **${user.tag}** has been unbanned.`);
        } else if (sub === "list") {
          if (!banDoc.userIds.length) return interaction.reply("No users are currently banned.");
          await interaction.reply(`**Banned Users:**\n${banDoc.userIds.map((id) => `• <@${id}>`).join("\n")}`);
        }
      } else if (group === "role") {
        if (sub === "ban") {
          const role = interaction.options.getRole("role", true);
          if (!banDoc.roleIds.includes(role.id)) {
            banDoc.roleIds.push(role.id);
            await banDoc.save();
          }
          await interaction.reply(`🚫 Role **${role.name}** has been banned from translation features.`);
        } else if (sub === "unban") {
          const role = interaction.options.getRole("role", true);
          banDoc.roleIds = banDoc.roleIds.filter((id) => id !== role.id);
          await banDoc.save();
          await interaction.reply(`✅ Role **${role.name}** has been unbanned.`);
        } else if (sub === "list") {
          if (!banDoc.roleIds.length) return interaction.reply("No roles are currently banned.");
          await interaction.reply(`**Banned Roles:**\n${banDoc.roleIds.map((id) => `• <@&${id}>`).join("\n")}`);
        }
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("custombot")
      .setDescription("Customize the bot's profile in this server")
      .addSubcommand((s) =>
        s
          .setName("set")
          .setDescription("Customize the bot's identity in this server")
          .addStringOption((o) => o.setName("name").setDescription("Custom name (Nickname)").setRequired(false))
          .addStringOption((o) => o.setName("avatar").setDescription("Avatar URL").setRequired(false))
          .addStringOption((o) => o.setName("banner").setDescription("Banner URL").setRequired(false))
          .addStringOption((o) => o.setName("bio").setDescription("Bot bio/description").setRequired(false))
      )
      .addSubcommand((s) => s.setName("reset").setDescription("Reset the bot's profile to default"))
      .addSubcommand((s) => s.setName("help").setDescription("Show help for custom bot"))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return interaction.reply("Servers only.");
      const sub = interaction.options.getSubcommand();
      const me = interaction.guild.members.me;

      if (sub === "help") {
        return interaction.reply("**Custom Bot Help:**\nUse `/custombot set` to change my identity in this server!");
      }

      if (sub === "set") {
        const name = interaction.options.getString("name");
        const avatar = interaction.options.getString("avatar");
        const banner = interaction.options.getString("banner");
        const bio = interaction.options.getString("bio");

        const updates = {};
        if (name) updates["features.customBotIdentity.nickname"] = name;
        if (avatar) updates["features.customBotIdentity.avatar"] = avatar;
        if (banner) updates["features.customBotIdentity.banner"] = banner;
        if (bio) updates["features.customBotIdentity.bio"] = bio;

        const GuildSettings = (await import("../../server/models/GuildSettings.js")).GuildSettings;
        await GuildSettings.findOneAndUpdate({ guildId: interaction.guildId }, { $set: updates }, { upsert: true });

        if (name) {
          try {
            await me.setNickname(name);
          } catch (err) {
            console.error("Could not set nickname", { error: err.message });
          }
        }

        await interaction.reply({ content: "✅ Custom Bot identity has been updated!", flags: [MessageFlags.Ephemeral] });
      } else if (sub === "reset") {
        const GuildSettings = (await import("../../server/models/GuildSettings.js")).GuildSettings;
        await GuildSettings.findOneAndUpdate(
          { guildId: interaction.guildId },
          { $unset: { "features.customBotIdentity": "" } }
        );
        try {
          await me.setNickname(null);
        } catch (err) {
          console.error("Could not reset nickname", { error: err.message });
        }
        await interaction.reply({ content: "✅ Custom Bot identity has been reset to default.", flags: [MessageFlags.Ephemeral] });
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("stats")
      .setDescription("View translation statistics for this server")
      .addStringOption((o) =>
        o
          .setName("type")
          .setDescription("Type of data to analyze")
          .addChoices(
            { name: "Messages", value: "TRANSLATED_MESSAGES" },
            { name: "Characters", value: "TRANSLATED_CHARACTERS" }
          )
      )
      .addStringOption((o) =>
        o
          .setName("period")
          .setDescription("Time period for data")
          .addChoices(
            { name: "Last 24 Hours", value: "24h" },
            { name: "Last 7 Days", value: "7d" },
            { name: "Last 30 Days", value: "30d" }
          )
      )
      .addChannelOption((o) => o.setName("channel").setDescription("Specific channel to analyze"))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return interaction.reply("Servers only.");
      await interaction.deferReply();

      const type = interaction.options.getString("type") || "TRANSLATED_MESSAGES";
      const period = interaction.options.getString("period") || "7d";
      const channel = interaction.options.getChannel("channel");
      const contextId = channel ? channel.id : "GLOBAL";

      let data = [];
      let summaryText = "";

      if (period === "24h") {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        data = await GuildStatsHourly.find({
          guildId: interaction.guildId,
          contextId,
          hourBucket: { $gte: since },
        }).sort({ hourBucket: 1 });
        summaryText = `Last 24 Hours (${contextId})`;
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
        summaryText = `Last ${days} Days (${contextId})`;
      }

      const totalValue = data.reduce((sum, item) => {
        return sum + (type === "TRANSLATED_MESSAGES" ? item.translatedMessages : item.translatedCharacters);
      }, 0);

      const settings = await (await import("../services/translationCore.js")).getGuildSettings(interaction.guildId);
      const day = new Date().toISOString().split("T")[0];
      const todayStats = await (await import("../../server/models/GuildStatsDaily.js")).GuildStatsDaily.findOne({
        guildId: interaction.guildId,
        contextId: "GLOBAL",
        day
      }).lean();
      
      const usedToday = todayStats?.translatedCharacters || 0;
      const maxChars = settings?.maxCharactersPerDay || 10000;
      const progress = Math.min(100, Math.round((usedToday / maxChars) * 100));
      const planName = (settings?.plan || "free").toUpperCase();

      const embed = new EmbedBuilder()
        .setColor(planName === "PRO" ? 0xFFD700 : planName === "PREMIUM" ? 0x5865F2 : 0x00ae86)
        .setTitle("📊 Translation Statistics")
        .setDescription(`Overview for **${interaction.guild.name}**`)
        .addFields(
          { name: "Server Plan", value: `**${planName}**`, inline: true },
          { name: "Context", value: contextId === "GLOBAL" ? "Entire Server" : `<#${contextId}>`, inline: true },
          { name: "Period", value: summaryText, inline: true },
          { name: "Data Type", value: type === "TRANSLATED_MESSAGES" ? "Messages" : "Characters", inline: true },
          { name: "Total Period Usage", value: `**${totalValue.toLocaleString()}** ${type === "TRANSLATED_MESSAGES" ? "messages" : "chars"}`, inline: true },
          { name: "Daily Limit Progress", value: `\`${usedToday.toLocaleString()} / ${maxChars.toLocaleString()}\` chars (${progress}%)\n${"🟩".repeat(progress / 10)}${"⬜".repeat(10 - progress / 10)}`, inline: false }
        )
        .setFooter({ text: "Use the button below to export data to CSV" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`export_csv:${type}:${period}:${contextId}`)
          .setLabel("Export to CSV")
          .setEmoji("📥")
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("set-context-language")
      .setDescription("Set the context command language for yourself")
      .addStringOption((o) => o.setName("language").setDescription("Target language code (e.g. en, hi, gu)").setRequired(true)),
    async execute(interaction) {
      if (!interaction.guildId) return interaction.reply("Servers only.");
      const lang = interaction.options.getString("language", true).toLowerCase();
      const UserTranslateConfig = (await import("../../server/models/UserTranslateConfig.js")).UserTranslateConfig;

      await UserTranslateConfig.findOneAndUpdate(
        { guildId: interaction.guildId, userId: interaction.user.id },
        { targetLanguage: lang, enabled: true },
        { upsert: true }
      );

      await interaction.reply({
        content: `✅ Your personal context language has been set to **${lang}**.`,
        flags: [MessageFlags.Ephemeral],
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("tts")
      .setDescription("Generate speech and play it in your current channel")
      .addStringOption((o) =>
        o
          .setName("voice")
          .setDescription("Voice type of the speech")
          .setRequired(true)
          .addChoices(
            { name: "Alloy", value: "alloy" },
            { name: "Echo", value: "echo" },
            { name: "Fable", value: "fable" },
            { name: "Nova", value: "nova" },
            { name: "Onyx", value: "onyx" },
            { name: "Shimmer", value: "shimmer" }
          )
      )
      .addStringOption((o) => o.setName("text").setDescription("Text to speak").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      if (!interaction.guildId) return interaction.reply("Servers only.");
      const voice = interaction.options.getString("voice", true);
      const text = interaction.options.getString("text", true);
      const member = interaction.member;

      if (!member.voice.channel) {
        return interaction.reply("❌ You must be in a voice channel for me to join and play audio!");
      }

      await interaction.deferReply();

      try {
        const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = await import("@discordjs/voice");
        const googleTTS = await import("google-tts-api");

        const url = googleTTS.getAudioUrl(text, { lang: "en", slow: false, host: "https://translate.google.com" });

        const connection = joinVoiceChannel({
          channelId: member.voice.channel.id,
          guildId: interaction.guildId,
          adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer();
        const resource = createAudioResource(url);

        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
          connection.destroy();
        });

        await interaction.editReply(`🎙️ Playing **${voice.toUpperCase()}** voice in <#${member.voice.channel.id}>...`);
      } catch (err) {
        await interaction.editReply(`❌ TTS Live failed: ${err.message}`);
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("tts-file")
      .setDescription("Generate speech and send it as a file")
      .addStringOption((o) =>
        o
          .setName("voice")
          .setDescription("Voice type")
          .setRequired(true)
          .addChoices(
            { name: "Alloy", value: "alloy" },
            { name: "Echo", value: "echo" },
            { name: "Fable", value: "fable" },
            { name: "Nova", value: "nova" },
            { name: "Onyx", value: "onyx" },
            { name: "Shimmer", value: "shimmer" }
          )
      )
      .addStringOption((o) => o.setName("text").setDescription("Text to speak").setRequired(true))
      .addStringOption((o) =>
        o
          .setName("format")
          .setDescription("Output format")
          .setRequired(false)
          .addChoices(
            { name: "MP3", value: "mp3" },
            { name: "WAV", value: "wav" }
          )
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      if (!interaction.guildId) return interaction.reply("Servers only.");
      await interaction.deferReply();
      const voice = interaction.options.getString("voice", true);
      const text = interaction.options.getString("text", true);
      const format = interaction.options.getString("format") || "mp3";

      try {
        const googleTTS = await import("google-tts-api");
        const axios = (await import("axios")).default;
        const { AttachmentBuilder } = await import("discord.js");

        const url = googleTTS.getAudioUrl(text, { lang: "en", slow: false, host: "https://translate.google.com" });
        
        // Download the audio file
        const response = await axios.get(url, { responseType: "arraybuffer" });
        const buffer = Buffer.from(response.data);

        const attachment = new AttachmentBuilder(buffer, { name: `tts-${voice}-${Date.now()}.${format}` });

        await interaction.editReply({
          content: `✅ Generated speech file (**${voice}**):`,
          files: [attachment],
        });
      } catch (err) {
        await interaction.editReply(`❌ TTS File generation failed: ${err.message}`);
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("transcribe")
      .setDescription("Transcribe audio from a voice channel")
      .addIntegerOption((o) => o.setName("time").setDescription("Seconds to listen (e.g. 10)").setRequired(true))
      .addStringOption((o) => o.setName("language").setDescription("Target language code").setRequired(false))
      .addBooleanOption((o) => o.setName("combined").setDescription("Transcribe global stream?").setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return interaction.reply("Servers only.");
      const member = interaction.member;
      if (!member.voice.channel) {
        return interaction.reply("❌ You must be in a voice channel to use this command!");
      }

      await interaction.reply(`🎤 **Transcription started!** I'm listening to <#${member.voice.channel.id}>...`);
      // Future logic: Join voice channel, record, and transcribe.
    },
  },
 {
  data: new ContextMenuCommandBuilder()
    .setName("Detect Language")
    .setType(ApplicationCommandType.Message),
    async execute(interaction) {
    await handleContextMenuDetect(interaction);
  },
},
];

async function handleContextMenuDetect(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const message = interaction.targetMessage;
  const content = message.content;

  if (!content?.trim()) {
    return interaction.editReply("This message has no text to detect.");
  }

  try {
    const detected = await detectLanguage(content);
    const langName = LANGUAGE_NAMES[detected.language] || detected.language;
    await interaction.editReply(`Detected Language: **${langName}** (Code: \`${detected.language}\`, Confidence: ${Math.round(detected.confidence * 100)}%)`);
  } catch (err) {
    await interaction.editReply(`Detection failed: ${err.message}`);
  }
}

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

    const sent = await interaction.editReply({ embeds: [embed], components });
    
    // Save to translation map for auto-erase support
    await saveTranslationMap({
      guildId: interaction.guildId,
      featureType: "CONTEXT_MENU",
      originalMessageId: message.id,
      sourceChannelId: message.channelId,
      translatedMessageIds: [`${interaction.channelId}:${sent.id}`],
    });
  } catch (err) {
    await interaction.editReply(`Translation failed: ${err.message}`);
  }
}
