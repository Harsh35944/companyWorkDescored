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
  getUserConfigs,
  incrementUsage,
  isUserBannedForTranslate,
  saveTranslationMap,
  translateText,
} from "./translationCore.js";
import { generateTTSUrl } from "./ttsService.js";

const FLAG_TO_LANG = {
  us: "en", gb: "en", au: "en", ca: "en", nz: "en", ie: "en",
  in: "hi", 
  fr: "fr", de: "de", es: "es", it: "it", pt: "pt", br: "pt",
  jp: "ja", kr: "ko", ru: "ru", cn: "zh", sa: "ar",
  tr: "tr", vn: "vi", th: "th", id: "id", my: "ms",
  nl: "nl", pl: "pl", se: "sv", no: "no", dk: "da",
  fi: "fi", gr: "el", il: "he", ir: "fa", ua: "uk",
  cz: "cs", hu: "hu", ro: "ro", sk: "sk", bg: "bg",
  pk: "ur", bd: "bn", np: "ne", lk: "si",
};

const LANG_TO_FLAG = {
  en: "🇺🇸", hi: "🇮🇳", gu: "🇮🇳", te: "🇮🇳", ta: "🇮🇳",
  kn: "🇮🇳", ml: "🇮🇳", bn: "🇮🇳", pa: "🇮🇳", mr: "🇮🇳",
  ur: "🇵🇰", as: "🇮🇳", sa: "🇮🇳",
  fr: "🇫🇷", de: "🇩🇪", es: "🇪🇸", it: "🇮🇹", pt: "🇵🇹",
  ru: "🇷🇺", ja: "🇯🇵", ko: "🇰🇷", zh: "🇨🇳", ar: "🇸🇦",
  tr: "🇹🇷", vi: "🇻🇳", th: "🇹🇭", id: "🇮🇩", ms: "🇲🇾",
  nl: "🇳🇱", pl: "🇵🇱", sv: "🇸🇪", no: "🇳🇴", da: "🇩🇰",
  fi: "🇫🇮", el: "🇬🇷", he: "🇮🇱", fa: "🇮🇷", uk: "🇺🇦",
  cs: "🇨🇿", hu: "🇭🇺", ro: "🇷🇴", sk: "🇸🇰", bg: "🇧🇬",
  ne: "🇳🇵", si: "🇱🇰",
};

const webhookCache = new Map();
const conversationBatches = new Map();

function flagEmojiToCode(emoji) {
  if (!emoji || emoji.length !== 4) return null;
  const points = [...emoji].map((c) => c.codePointAt(0));
  if (points.some((n) => n < 0x1f1e6 || n > 0x1f1ff)) return null;
  return points.map((n) => String.fromCharCode(n - 0x1f1e6 + 65)).join("").toLowerCase();
}

export async function handleMessageCreate(message) {
  if (message.author.id === message.client.user.id || !message.guildId || !message.content?.trim()) return;

  const settings = await getGuildSettings(message.guildId);
  if (!settings) return;

  if (await isUserBannedForTranslate(message.guildId, message.member)) return;

  const conversationModeEnabled = Boolean(settings.features?.conversationModeEnabled);
  const conversationModeDelay = settings.conversationModeDelay || 0;

  if (conversationModeEnabled && conversationModeDelay > 0 && !message.embeds.length) {
    const batchKey = `${message.guildId}:${message.channelId}:${message.author.id}`;
    let batch = conversationBatches.get(batchKey);

    if (batch) {
      clearTimeout(batch.timer);
      batch.content.push(message.content);
    } else {
      batch = {
        content: [message.content],
        timer: null,
      };
    }

    batch.timer = setTimeout(async () => {
      const fullContent = batch.content.join("\n");
      conversationBatches.delete(batchKey);
      await processTranslation(message, fullContent, settings);
    }, conversationModeDelay * 1000);

    conversationBatches.set(batchKey, batch);
    return;
  }

  await processTranslation(message, message.content, settings);
}

async function processTranslation(message, inputContent, settings) {
  // Check limit
  const { checkCharacterLimit } = await import("./translationCore.js");
  const canTranslate = await checkCharacterLimit(message.guildId);
  if (!canTranslate) {
    return logger.warn("Character limit reached for guild", { guildId: message.guildId });
  }

  const input = await applyTextReplacements(message.guildId, inputContent);
  const translationTasks = [];
  let primaryFeatureType = "AUTO";
  const ttsEnabled = Boolean(settings?.features?.ttsEnabled);
  const autoEraseEnabled = Boolean(settings?.features?.autoEraseEnabled);
  const autoEraseMode = settings?.autoEraseMode || "ONLY_FROM_ORIGINAL";
  const eraseDelay = (settings?.autoEraseDelay || 30) * 1000;

  // 1. Auto-Translate Logic
  if (settings.features?.autoTranslateEnabled) {
    const autoConfigs = await getAutoConfigs(message.guildId, message);
    for (const cfg of autoConfigs) {
      if (cfg.ignoreBots && message.author.bot) continue;
      if (cfg.ignoreLinks && /(https?:\/\/[^\s]+)/g.test(input)) continue;
      if (cfg.ignoreEmojis && !/[a-zA-Z0-9]/.test(input)) continue;

      for (const target of cfg.targets) {
        translationTasks.push(async () => {
          const out = await translateText(input, cfg.sourceLanguage, target.targetLanguage);
          
          if (cfg.ignoreIfSourceIsTarget && out.sourceLanguage === target.targetLanguage) return null;
          if (cfg.ignoreIfSourceIsNotInput && cfg.sourceLanguage && out.sourceLanguage !== cfg.sourceLanguage) return null;

          const targetChannelId = target.targetId === "all" ? message.channelId : target.targetId;
          const channel = await message.client.channels.fetch(targetChannelId).catch(() => null);
          if (!channel?.isTextBased?.()) return null;

          const style = cfg.style || settings.defaultStyle || "TEXT";
          const finalContent = cfg.format ? cfg.format.replace("{text}", out.translatedText) : out.translatedText;
          const allowedMentions = cfg.disableMention ? { parse: [] } : undefined;
          
          const components = [];
          if (ttsEnabled) {
            const ttsUrl = await generateTTSUrl(finalContent, target.targetLanguage);
            if (ttsUrl) {
              components.push(
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setLabel("Listen").setEmoji("🔊").setStyle(ButtonStyle.Link).setURL(ttsUrl),
                ),
              );
            }
          }

          let sent;
          if (style === "WEBHOOK") {
            const hook = await getOrCreateWebhook(channel);
            if (hook) {
              const customId = settings.features?.customBotIdentity;
              const files = cfg.attachmentMode === "FORWARD" ? [...message.attachments.values()].map(a => a.url) : [];
              sent = await hook.send({
                content: finalContent,
                username: customId?.nickname || message.member?.displayName || message.author.username,
                avatarURL: customId?.avatar || message.author.displayAvatarURL(),
                components,
                allowedMentions,
                files
              }).catch(async (err) => {
                if (err.code === 10015 || err.status === 404) {
                  webhookCache.delete(channel.id);
                }
                return null;
              });
            }
          } else if (style === "EMBED") {
            const files = cfg.attachmentMode === "FORWARD" ? [...message.attachments.values()].map(a => a.url) : [];
            const embed = new EmbedBuilder()
              .setAuthor({ name: message.member?.displayName || message.author.username, iconURL: message.author.displayAvatarURL() })
              .setDescription(finalContent)
              .setColor(settings.plan === "pro" ? "#FFD700" : "#5865F2")
              .setFooter({ text: `Translated from ${out.sourceLanguage.toUpperCase()} to ${target.targetLanguage.toUpperCase()}` });
            
            if (cfg.attachmentMode === "FORWARD" && message.attachments.size > 0) {
              const firstImg = message.attachments.find(a => a.contentType?.startsWith("image/"));
              if (firstImg) embed.setImage(firstImg.url);
            }

            sent = await channel.send({ embeds: [embed], components, allowedMentions, files: files.length > 0 && !embed.data.image ? files : [] });
          } else {
            const files = cfg.attachmentMode === "FORWARD" ? [...message.attachments.values()].map(a => a.url) : [];
            sent = await channel.send({ content: finalContent, components, allowedMentions, files });
          }

          if (sent) {
            await incrementUsage(message.guildId, message.author.id, finalContent.length, 1, channel.id);
            if (cfg.autoDisappearDelay > 0) {
              setTimeout(() => sent.delete().catch(() => {}), cfg.autoDisappearDelay * 1000);
            }
            if (cfg.deleteOriginal) {
              message.delete().catch(() => {});
            }
          }
          return sent ? { id: `${sent.channel.id}:${sent.id}`, chars: finalContent.length } : null;
        });
      }
    }
  }

  // 2. Role-Translate Logic
  if (settings.features?.roleTranslateEnabled) {
    const roleConfigs = await getRoleConfigs(message.guildId, message.member);
    if (roleConfigs.length > 0) primaryFeatureType = "ROLE";
    for (const cfg of roleConfigs) {
      translationTasks.push(async () => {
        const out = await translateText(input, cfg.sourceLanguage, cfg.targetLanguage);
        
        if (cfg.ignoreIfSourceIsTarget && out.sourceLanguage === cfg.targetLanguage) return null;
        if (cfg.ignoreIfSourceIsNotInput && cfg.sourceLanguage && out.sourceLanguage !== cfg.sourceLanguage) return null;
        if (cfg.ignoreEmojis && !/[a-zA-Z0-9]/.test(input)) return null;

        const style = cfg.style || settings.defaultStyle || "TEXT";
        const finalContent = cfg.format ? cfg.format.replace("{text}", out.translatedText) : out.translatedText;
        const allowedMentions = cfg.disableMention ? { parse: [] } : undefined;
        
        const components = [];
        if (ttsEnabled) {
          const ttsUrl = await generateTTSUrl(finalContent, cfg.targetLanguage);
          if (ttsUrl) {
            components.push(
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel("Listen").setEmoji("🔊").setStyle(ButtonStyle.Link).setURL(ttsUrl)
              )
            );
          }
        }

        let sent;
        if (style === "WEBHOOK") {
          const hook = await getOrCreateWebhook(message.channel);
          if (hook) {
            const customId = settings.features?.customBotIdentity;
            const files = cfg.attachmentMode === "FORWARD" ? [...message.attachments.values()].map(a => a.url) : [];
            sent = await hook.send({
              content: finalContent,
              username: customId?.nickname || message.member?.displayName || message.author.username,
              avatarURL: customId?.avatar || message.author.displayAvatarURL(),
              components,
              allowedMentions,
              files
            });
          }
        } else if (style === "EMBED") {
          const files = cfg.attachmentMode === "FORWARD" ? [...message.attachments.values()].map(a => a.url) : [];
          const embed = new EmbedBuilder()
            .setAuthor({ name: message.member?.displayName || message.author.username, iconURL: message.author.displayAvatarURL() })
            .setDescription(finalContent)
            .setColor("#00ff00")
            .setFooter({ text: "Role Translation" });
          
          if (cfg.attachmentMode === "FORWARD" && message.attachments.size > 0) {
            const firstImg = message.attachments.find(a => a.contentType?.startsWith("image/"));
            if (firstImg) embed.setImage(firstImg.url);
          }
          sent = await message.channel.send({ embeds: [embed], components, allowedMentions, files: files.length > 0 && !embed.data.image ? files : [] });
        } else {
          const files = cfg.attachmentMode === "FORWARD" ? [...message.attachments.values()].map(a => a.url) : [];
          sent = await message.channel.send({ content: finalContent, components, allowedMentions, files });
        }

        if (sent) {
          await incrementUsage(message.guildId, message.author.id, finalContent.length, 1, message.channelId);
          if (cfg.autoDisappearDelay > 0) {
            setTimeout(() => sent.delete().catch(() => {}), cfg.autoDisappearDelay * 1000);
          }
          if (cfg.deleteOriginal) {
            message.delete().catch(() => {});
          }
        }
        return sent ? { id: `${sent.channel.id}:${sent.id}`, chars: finalContent.length } : null;
      });
    }
  }

  // 3. User-Translate Logic
  if (Boolean(settings?.features?.userTranslateEnabled)) {
    const userConfigs = await getUserConfigs(message.guildId, message.author.id);
    if (userConfigs.length > 0) primaryFeatureType = "USER";
    for (const cfg of userConfigs) {
      translationTasks.push(async () => {
        const out = await translateText(input, null, cfg.targetLanguage);
        const components = [];
        if (ttsEnabled) {
          const ttsUrl = await generateTTSUrl(out.translatedText, cfg.targetLanguage);
          if (ttsUrl) {
            components.push(
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel("Listen").setEmoji("🔊").setStyle(ButtonStyle.Link).setURL(ttsUrl),
              ),
            );
          }
        }
        const sent = await message.channel.send({ content: out.translatedText, components });
        if (sent) {
          await Promise.all([
            incrementUsage(message.guildId, message.author.id, out.translatedText.length, 1, message.channelId),
          ]);
          return { id: `${sent.channel.id}:${sent.id}`, chars: out.translatedText.length };
        }
        return null;
      });
    }
  }

  const results = await Promise.all(translationTasks.map((t) => t().catch((err) => {
    logger.error("Translation task failed", { error: err.message, guildId: message.guildId });
    return null;
  })));

  const validResults = results.filter((r) => r !== null);
  const translatedIds = validResults.map((r) => r.id);
  const totalChars = validResults.reduce((sum, r) => sum + r.chars, 0);
  const totalCount = validResults.length;

  if (settings.features?.autoReactEnabled) {
    detectLanguage(input).then((res) => {
      if (res.language !== "unknown") {
        const flag = LANG_TO_FLAG[res.language];
        if (flag) message.react(flag).catch(() => {});
      }
    }).catch(() => {});
  }

  if (totalCount > 0) {
    await Promise.all([
      incrementUsage(message.guildId, message.author.id, totalChars, totalCount, message.channelId),
      saveTranslationMap({
        guildId: message.guildId,
        featureType: primaryFeatureType,
        originalMessageId: message.id,
        sourceChannelId: message.channelId,
        translatedMessageIds: translatedIds,
      }),
    ]);

    // Schedule Auto-Erase
    if (autoEraseEnabled) {
      setTimeout(async () => {
        try {
          if (autoEraseMode === "ONLY_FROM_ORIGINAL" || autoEraseMode === "ALL") {
            await message.delete().catch(() => {});
          } else if (autoEraseMode === "ONLY_FROM_TRANSLATED") {
            for (const pair of translatedIds) {
              await deleteById(message.client, pair).catch(() => {});
            }
          }
        } catch (err) {
          logger.error("Auto-Erase execution failed", { error: err.message, guildId: message.guildId });
        }
      }, eraseDelay);
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
  if (!settings?.features?.translationByFlagEnabled) {
    logger.debug("Flag reaction skipped: feature disabled in settings", { guildId: message.guildId });
    return;
  }

  let cfg = await getFlagConfig(message.guildId);
  if (!cfg) {
    // If global feature is ON, we use default config even if a specific doc doesn't exist
    cfg = { enabled: true, style: "TEXT", sendInPm: false, sendInThread: false, autoDisappearSeconds: 0 };
    logger.debug("Using default flag config (no custom config found)", { guildId: message.guildId });
  }

  const code = flagEmojiToCode(reaction.emoji.name);
  const language = code ? FLAG_TO_LANG[code] : null;
  if (!language) {
    logger.debug("Flag reaction skipped: unsupported flag or non-flag emoji", { emoji: reaction.emoji.name });
    return;
  }

  const { checkCharacterLimit } = await import("./translationCore.js");
  if (!(await checkCharacterLimit(message.guildId))) return;

  const out = await translateText(message.content, null, language);
  let components = [];
  if (settings.features?.ttsEnabled) {
    const ttsUrl = await generateTTSUrl(out.translatedText, language);
    if (ttsUrl) {
      components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Listen").setEmoji("🔊").setStyle(ButtonStyle.Link).setURL(ttsUrl)
        )
      ];
    }
  }

  const files = [...message.attachments.values()].map(a => a.url);
  const sentOptions = {
    content: cfg.style === "TEXT" ? out.translatedText : undefined,
    embeds: cfg.style === "EMBED" ? [
      new EmbedBuilder()
        .setColor("#0099ff")
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setDescription(out.translatedText)
        .setFooter({ text: `Translated to ${language}` })
    ] : [],
    allowedMentions: { repliedUser: false },
    components,
    files
  };

  if (cfg.style === "EMBED" && message.attachments.size > 0) {
    const firstImg = message.attachments.find(a => a.contentType?.startsWith("image/"));
    if (firstImg) sentOptions.embeds[0].setImage(firstImg.url);
    if (sentOptions.embeds[0].data.image) sentOptions.files = []; 
  }

  let sent;
  if (cfg.sendInPm) {
    sent = await user.send(sentOptions).catch(() => null);
  } else if (cfg.sendInThread) {
    let thread = message.thread;
    if (!thread) {
      thread = await message.startThread({ name: `Translation - ${language}`, autoArchiveDuration: 60 }).catch(() => null);
    }
    if (thread) sent = await thread.send(sentOptions).catch(() => null);
  } else {
    sent = await message.reply(sentOptions).catch(() => null);
  }

  if (sent) {
    await Promise.all([
      incrementUsage(message.guildId, user.id, out.translatedText.length, 1, message.channelId),
      saveTranslationMap({
        guildId: message.guildId,
        featureType: "FLAG",
        originalMessageId: message.id,
        sourceChannelId: message.channelId,
        translatedMessageIds: [`${sent.channel.id}:${sent.id}`],
      }),
    ]);
    if (cfg.autoDisappearSeconds > 0) {
      setTimeout(() => { sent.delete().catch(() => {}); }, cfg.autoDisappearSeconds * 1000);
    }
  }
}



export async function handleAutoReact(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();
  const message = reaction.message;
  if (!message.guildId) return;

  const settings = await getGuildSettings(message.guildId);
  if (!settings?.features?.autoReactEnabled) return;

  // Find linked messages
  const map = await TranslationMessageMap.findOne({
    guildId: message.guildId,
    $or: [
      { originalMessageId: message.id },
      { translatedMessageIds: { $regex: new RegExp(`:${message.id}$`) } }
    ],
  });

  if (!map) return;

  const emoji = reaction.emoji.id || reaction.emoji.name;
  const targetIds = [map.originalMessageId, ...map.translatedMessageIds].filter((id) => id !== message.id);

  for (const pair of targetIds) {
    try {
      const [channelId, msgId] = pair.includes(":") ? pair.split(":") : [message.channelId, pair];
      const channel = await message.client.channels.fetch(channelId).catch(() => null);
      if (!channel) continue;
      const targetMsg = await channel.messages.fetch(msgId).catch(() => null);
      if (targetMsg) await targetMsg.react(emoji).catch(() => {});
    } catch (err) {}
  }
}

async function deleteById(client, pair) {
  if (!pair) return;
  const [channelId, messageId] = pair.includes(":") ? pair.split(":") : [null, pair];
  if (!channelId || !messageId) return;
  
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  
  const m = await channel.messages.fetch(messageId).catch(() => null);
  if (m) {
    await m.delete().catch((err) => {
      logger.error("Failed to delete message in deleteById", { messageId, error: err.message });
    });
    logger.info("Deleted message via deleteById", { messageId });
  } else {
    logger.warn("Message not found in deleteById", { messageId });
  }
}

async function getOrCreateWebhook(channel) {
  if (webhookCache.has(channel.id)) return webhookCache.get(channel.id);
  try {
    if (!channel.guild.members.me.permissions.has("ManageWebhooks")) return null;
    const targetChannel = channel.isThread?.() ? channel.parent : channel;
    if (!targetChannel || !targetChannel.fetchWebhooks) return null;
    const webhooks = await targetChannel.fetchWebhooks().catch(() => null);
    if (!webhooks) return null;
    let hook = webhooks.find((h) => h.owner.id === channel.client.user.id);
    if (!hook) {
      hook = await channel.createWebhook({ name: "Translation Webhook", avatar: channel.client.user.displayAvatarURL() });
    }
    webhookCache.set(channel.id, hook);
    return hook;
  } catch (err) {
    return null;
  }
}

export async function handleMessageDelete(message) {
  const guildId = message.guildId || message.channel?.guildId;
  if (!guildId) return;
  const settings = await getGuildSettings(guildId);
  if (!settings?.features?.autoEraseEnabled) return;
  
  logger.info("Auto-Erase triggered", { messageId: message.id, mode: settings.autoEraseMode });

  const mapByOriginal = await TranslationMessageMap.findOne({ guildId, originalMessageId: message.id });
  if (mapByOriginal) {
    const deletions = mapByOriginal.translatedMessageIds.map((pair) => deleteById(message.client, pair));
    await Promise.all([...deletions, TranslationMessageMap.deleteOne({ _id: mapByOriginal._id })]);
    return;
  }

  if (settings.autoEraseMode !== "ALL") return;
  const mapByTranslated = await TranslationMessageMap.findOne({
    guildId,
    translatedMessageIds: { $regex: new RegExp(`:${message.id}$`) }
  });
  if (!mapByTranslated) return;
  
  const targetIds = mapByTranslated.translatedMessageIds.filter(pair => !pair.endsWith(`:${message.id}`));
  const deletions = [
    deleteById(message.client, `${mapByTranslated.sourceChannelId}:${mapByTranslated.originalMessageId}`),
    ...targetIds.map(pair => deleteById(message.client, pair))
  ];
  await Promise.all([...deletions, TranslationMessageMap.deleteOne({ _id: mapByTranslated._id })]);
}
