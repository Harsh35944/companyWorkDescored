import { TranslationMessageMap } from "../../server/models/TranslationMessageMap.js";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../utils/logger.js";
import {
  applyTextReplacements,
  detectLanguage,
  getAutoConfigs,
  getFlagConfig,
  getGuildSettings,
  getRoleConfigs,
  incrementUsage,
  isUserBannedForTranslate,
  saveTranslationMap,
  translateText,
} from "./translationCore.js";

const FLAG_TO_LANG = {
  us: "en",
  gb: "en",
  in: "hi",
  fr: "fr",
  de: "de",
  es: "es",
  jp: "ja",
  kr: "ko",
  ru: "ru",
  cn: "zh",
};

const LANG_TO_FLAG = {
  en: "🇺🇸",
  hi: "🇮🇳",
  gu: "🇮🇳",
  fr: "🇫🇷",
  de: "🇩🇪",
  es: "🇪🇸",
  ja: "🇯🇵",
  ko: "🇰🇷",
  ru: "🇷🇺",
  zh: "🇨🇳",
};

// Simple in-memory cache for webhooks (key: channelId, value: Webhook)
const webhookCache = new Map();

function flagEmojiToCode(emoji) {
  if (!emoji || emoji.length !== 4) return null;
  const points = [...emoji].map((c) => c.codePointAt(0));
  if (points.some((n) => n < 0x1f1e6 || n > 0x1f1ff)) return null;
  return points.map((n) => String.fromCharCode(n - 0x1f1e6 + 65)).join("").toLowerCase();
}

export async function handleMessageCreate(message) {
  if (message.author.bot || !message.guildId || !message.content?.trim()) return;

  const settings = await getGuildSettings(message.guildId);
  const perms = message.channel.permissionsFor(message.guild.members.me);
  

  if (!settings) return;


  const input = await applyTextReplacements(message.guildId, message.content);
  const translationTasks = [];

  // 1. Auto-Translate Logic
  if (settings.features?.autoTranslateEnabled) {
    const autoConfigs = await getAutoConfigs(message.guildId, message);
    for (const cfg of autoConfigs) {
      for (const target of cfg.targets) {
        translationTasks.push(async () => {
          const out = await translateText(input, cfg.sourceLanguage, target.targetLanguage);
          const targetChannelId = target.targetId === "all" ? message.channelId : target.targetId;
          const channel = await message.client.channels.fetch(targetChannelId).catch(() => null);
          if (!channel?.isTextBased?.()) return null;

          const style = cfg.style || settings.defaultStyle || "TEXT";
          const components = [];
          if (settings.features?.ttsEnabled) {
            components.push(
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`tts:${target.targetLanguage}`)
                  .setLabel("Listen")
                  .setEmoji("🔊")
                  .setStyle(ButtonStyle.Secondary),
              ),
            );
          }

          let sent;
          if (style === "WEBHOOK") {
            const hook = await getOrCreateWebhook(channel);
            if (hook) {
              sent = await hook.send({
                content: out.translatedText,
                username: message.member?.displayName || message.author.username,
                avatarURL: message.author.displayAvatarURL(),
                components,
              });
            }
          } else if (style === "EMBED") {
            const embed = new EmbedBuilder()
              .setColor(0x5865f2)
              .setAuthor({
                name: message.member?.displayName || message.author.username,
                iconURL: message.author.displayAvatarURL(),
              })
              .setDescription(out.translatedText)
              .setFooter({ text: `Translated: ${out.sourceLanguage} → ${out.targetLanguage}` });
            sent = await channel.send({ embeds: [embed], components });
          }

          if (!sent) {
            sent = await channel.send({
              content: out.translatedText,
              allowedMentions: { parse: [] },
              components,
            });
          }
          return { id: sent.id, chars: out.translatedText.length };
        });
      }
    }
  }

  // 2. Role-Translate Logic
  if (settings.features?.roleTranslateEnabled) {
    const roleConfigs = await getRoleConfigs(message.guildId, message.member);
    for (const cfg of roleConfigs) {
      translationTasks.push(async () => {
        const out = await translateText(input, null, cfg.targetLanguage);
        const sent = await message.reply({
          content: out.translatedText,
          allowedMentions: { repliedUser: false },
        });
        return { id: sent.id, chars: out.translatedText.length };
      });
    }
  }

  // Execute all translation/sending tasks in parallel
  const results = await Promise.all(translationTasks.map((t) => t().catch((err) => {
    logger.error("Translation task failed", { error: err.message, guildId: message.guildId });
    return null;
  })));

  const validResults = results.filter((r) => r !== null);
  const translatedIds = validResults.map((r) => r.id);
  const totalChars = validResults.reduce((sum, r) => sum + r.chars, 0);
  const totalCount = validResults.length;

  // 3. Auto-React Logic (Detect language)
  if (settings.features?.autoReactEnabled) {
    detectLanguage(input).then((res) => {
      if (res.language !== "unknown" && res.language !== "en") {
        const flag = LANG_TO_FLAG[res.language];
        if (flag) {
          message.react(flag).catch(() => {});
        }
      }
    }).catch(() => {});
  }

  if (totalCount > 0) {
    await Promise.all([
      incrementUsage(message.guildId, message.author.id, totalChars, totalCount),
      saveTranslationMap({
        guildId: message.guildId,
        featureType: "AUTO",
        originalMessageId: message.id,
        sourceChannelId: message.channelId,
        translatedMessageIds: translatedIds,
      }),
    ]);

    // Handle Auto-Erase
    if (settings.features?.autoEraseEnabled) {
      const mode = settings.autoEraseMode || "ONLY_FROM_ORIGINAL";
      logger.info("Attempting auto-erase", { mode, messageId: message.id });
      try {
        if (mode === "ONLY_FROM_ORIGINAL") {
          await message.delete()
            .then(() => logger.info("Message deleted successfully", { messageId: message.id }))
            .catch((e) => logger.warn("Message delete failed", { error: e.message }));
        } else if (mode === "ALL") {
          await message.delete()
            .then(() => logger.info("Message deleted successfully", { messageId: message.id }))
            .catch((e) => logger.warn("Message delete failed", { error: e.message }));
        }
      } catch (err) {
        logger.error("Auto-erase failed", { error: err.message, guildId: message.guildId });
      }
    }
  }
}

export async function handleFlagReaction(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();
  const message = reaction.message;
  if (!message.guildId || !message.content?.trim()) return;

  const settings = await getGuildSettings(message.guildId);
  if (!settings?.features?.translationByFlagEnabled) return;
  const cfg = await getFlagConfig(message.guildId);
  if (!cfg) return;

  const code = flagEmojiToCode(reaction.emoji.name);
  const language = code ? FLAG_TO_LANG[code] : null;
  if (!language) return;

  const out = await translateText(message.content, null, language);
  const sent = await message.reply({
    content: out.translatedText,
    allowedMentions: { repliedUser: false },
  });
  
  await Promise.all([
    incrementUsage(message.guildId, user.id, out.translatedText.length, 1),
    saveTranslationMap({
      guildId: message.guildId,
      featureType: "FLAG",
      originalMessageId: message.id,
      sourceChannelId: message.channelId,
      translatedMessageIds: [sent.id],
    }),
  ]);

  if (cfg.autoDisappearSeconds > 0) {
    setTimeout(() => {
      sent.delete().catch(() => {});
    }, cfg.autoDisappearSeconds * 1000);
  }
}

async function deleteById(channel, messageId) {
  const m = await channel.messages.fetch(messageId).catch(() => null);
  if (m) await m.delete().catch(() => null);
}

async function getOrCreateWebhook(channel) {
  // Check cache first
  if (webhookCache.has(channel.id)) {
    return webhookCache.get(channel.id);
  }

  try {
    if (!channel.guild.members.me.permissions.has("ManageWebhooks")) return null;
    
    // Threads don't have webhooks, their parent channels do
    const targetChannel = channel.isThread?.() ? channel.parent : channel;
    if (!targetChannel || !targetChannel.fetchWebhooks) return null;

    const webhooks = await targetChannel.fetchWebhooks().catch(() => null);
    if (!webhooks) return null;
    
    let hook = webhooks.find((h) => h.owner.id === channel.client.user.id);
    if (!hook) {
      hook = await channel.createWebhook({
        name: "Translation Webhook",
        avatar: channel.client.user.displayAvatarURL(),
      });
    }
    
    webhookCache.set(channel.id, hook);
    return hook;
  } catch (err) {
    logger.warn("webhook fetch/create failed", { channelId: channel.id, message: err.message });
    return null;
  }
}

export async function handleMessageDelete(message) {
  if (!message.guildId) return;
  const settings = await getGuildSettings(message.guildId);
  if (!settings?.features?.autoEraseEnabled) return;

  const mapByOriginal = await TranslationMessageMap.findOne({
    guildId: message.guildId,
    originalMessageId: message.id,
  });
  
  if (mapByOriginal) {
    const deletions = mapByOriginal.translatedMessageIds.map((id) => deleteById(message.channel, id));
    await Promise.all([
      ...deletions,
      TranslationMessageMap.deleteOne({ _id: mapByOriginal._id }),
    ]);
    return;
  }

  if (settings.autoEraseMode !== "ALL") return;
  const mapByTranslated = await TranslationMessageMap.findOne({
    guildId: message.guildId,
    translatedMessageIds: message.id,
  });
  
  if (!mapByTranslated) return;
  const deletions = mapByTranslated.translatedMessageIds
    .filter(id => id !== message.id)
    .map(id => deleteById(message.channel, id));
    
  await Promise.all([
    ...deletions,
    TranslationMessageMap.deleteOne({ _id: mapByTranslated._id }),
  ]);
}
