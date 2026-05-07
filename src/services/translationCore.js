import { GuildSettings } from "../../server/models/GuildSettings.js";
import { AutoTranslateConfig } from "../../server/models/AutoTranslateConfig.js";
import { RoleTranslateConfig } from "../../server/models/RoleTranslateConfig.js";
import { FlagReactionConfig } from "../../server/models/FlagReactionConfig.js";
import { TextReplacement } from "../../server/models/TextReplacement.js";
import { TranslateBan } from "../../server/models/TranslateBan.js";
import { UserTranslateConfig } from "../../server/models/UserTranslateConfig.js";
import { GuildStatsDaily } from "../../server/models/GuildStatsDaily.js";
import { GuildStatsHourly } from "../../server/models/GuildStatsHourly.js";
import { TranslationMessageMap } from "../../server/models/TranslationMessageMap.js";
import { UserGuildStats } from "../../server/models/UserGuildStats.js";
import { translate } from "google-translate-api-x";
import NodeCache from "node-cache";
import { logger } from "../utils/logger.js";

// Cache for settings and configs (TTL 60 seconds)
const configCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

function toUtcDayString(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hourBucketDate(d) {
  const out = new Date(d);
  out.setUTCMinutes(0, 0, 0);
  return out;
}

export async function detectLanguage(text) {
  if (!text?.trim()) return { language: "unknown", confidence: 0 };
  
  // Fast regex checks for specific scripts
  if (/[઀-૿]/.test(text)) return { language: "gu", confidence: 0.95 };
  if (/[\u0900-\u097F]/.test(text)) return { language: "hi", confidence: 0.95 };
  
  try {
    const res = await translate(text, { to: "en" });
    return {
      language: res.from.language.iso,
      confidence: 1,
    };
  } catch {
    // Basic fallback logic
    if (/[ぁ-んァ-ン]/.test(text)) return { language: "ja", confidence: 0.9 };
    if (/[а-яА-Я]/.test(text)) return { language: "ru", confidence: 0.9 };
    return { language: "unknown", confidence: 0 };
  }
}

export async function translateText(text, sourceLang, targetLang) {
  if (sourceLang && sourceLang.toLowerCase() === targetLang.toLowerCase()) {
    return {
      translatedText: text,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
    };
  }

  try {
    const res = await translate(text, {
      from: sourceLang || "auto",
      to: targetLang.toLowerCase(),
      forceTo: true,
    });
    return {
      translatedText: res.text,
      sourceLanguage: res.from.language.iso,
      targetLanguage: targetLang,
    };
  } catch (err) {
    logger.error("Translation error", { 
      error: err instanceof Error ? err.message : String(err),
      text: text.substring(0, 50),
      targetLang 
    });
    // Fallback to original text if translation fails
    return {
      translatedText: text,
      sourceLanguage: sourceLang || "unknown",
      targetLanguage: targetLang,
    };
  }
}

export async function applyTextReplacements(guildId, content) {
  const cacheKey = `replacements:${guildId}`;
  let rules = configCache.get(cacheKey);
  
  if (!rules) {
    rules = await TextReplacement.find({ guildId }).lean();
    configCache.set(cacheKey, rules);
  }

  let out = content;
  for (const rule of rules) {
    out = out.split(rule.input).join(rule.output);
  }
  return out;
}

export async function isUserBannedForTranslate(guildId, member) {
  const cacheKey = `ban:${guildId}`;
  let ban = configCache.get(cacheKey);
  
  if (ban === undefined) {
    ban = await TranslateBan.findOne({ guildId }).lean();
    configCache.set(cacheKey, ban || null);
  }

  if (!ban) return false;
  if (ban.userIds.includes(member.id)) return true;
  const roleIds = member.roles?.cache ? [...member.roles.cache.keys()] : [];
  return roleIds.some((r) => ban.roleIds.includes(r));
}

export async function incrementUsage(guildId, userId, translatedCharacters, translatedMessages) {
  const now = new Date();
  const day = toUtcDayString(now);
  const hourBucket = hourBucketDate(now);

  // We can't easily combine these as they are different collections, 
  // but we use Promise.all to run them concurrently.
  await Promise.all([
    GuildStatsDaily.updateOne(
      { guildId, day },
      { $inc: { translatedCharacters, translatedMessages } },
      { upsert: true },
    ),
    GuildStatsHourly.updateOne(
      { guildId, hourBucket },
      { $inc: { translatedCharacters, translatedMessages } },
      { upsert: true },
    ),
    UserGuildStats.updateOne(
      { guildId, userId, day },
      { $inc: { translatedCharacters, translatedMessages } },
      { upsert: true },
    ),
  ]).catch(err => {
    logger.error("Failed to increment usage stats", { error: err.message, guildId, userId });
  });
}

export async function saveTranslationMap({
  guildId,
  featureType,
  originalMessageId,
  sourceChannelId,
  translatedMessageIds,
}) {
  await TranslationMessageMap.findOneAndUpdate(
    { guildId, featureType, originalMessageId },
    { $set: { sourceChannelId, translatedMessageIds } },
    { upsert: true, new: true },
  ).catch(err => {
    logger.error("Failed to save translation map", { error: err.message, guildId, originalMessageId });
  });
}

export async function setTranslatedMessageIds({
  guildId,
  featureType,
  originalMessageId,
  translatedMessageIds,
}) {
  await TranslationMessageMap.findOneAndUpdate(
    { guildId, featureType, originalMessageId },
    { $set: { translatedMessageIds } },
    { new: true },
  ).catch(err => {
    logger.error("Failed to update translation map ids", { error: err.message, guildId, originalMessageId });
  });
}

export async function getGuildSettings(guildId) {
  const cacheKey = `settings:${guildId}`;
  let settings = configCache.get(cacheKey);
  
  if (settings === undefined) {
    settings = await GuildSettings.findOne({ guildId }).lean();
    configCache.set(cacheKey, settings || null);
  }
  
  return settings;
}

export async function getAutoConfigs(guildId, message) {
  const cacheKey = `autoConfigs:${guildId}`;
  let rows = configCache.get(cacheKey);
  
  if (!rows) {
    rows = await AutoTranslateConfig.find({ guildId, enabled: true }).lean();
    configCache.set(cacheKey, rows);
  }

  return rows.filter((r) => {
    if (r.sourceId === "all") return true;
    return r.sourceType === "CATEGORY"
      ? message.channel.parentId && r.sourceId === message.channel.parentId
      : r.sourceId === message.channelId;
  });
}

export async function getRoleConfigs(guildId, member) {
  const cacheKey = `roleConfigs:${guildId}`;
  let rows = configCache.get(cacheKey);
  
  if (!rows) {
    rows = await RoleTranslateConfig.find({ guildId, enabled: true }).lean();
    configCache.set(cacheKey, rows);
  }

  let roleIds = [];
  if (member.roles?.cache) {
    roleIds = [...member.roles.cache.keys()];
  } else if (Array.isArray(member.roles)) {
    roleIds = member.roles;
  }
  
  // Ensure guildId is included as it represents the @everyone role
  if (member.guild?.id && !roleIds.includes(member.guild.id)) {
    roleIds.push(member.guild.id);
  }

  return rows.filter((r) => roleIds.includes(r.roleId));
}

export async function getUserConfigs(guildId, userId) {
  const cacheKey = `userConfig:${guildId}:${userId}`;
  let config = configCache.get(cacheKey);

  if (config === undefined) {
    config = await UserTranslateConfig.findOne({ guildId, userId, enabled: true }).lean();
    configCache.set(cacheKey, config || null);
  }

  return config ? [config] : [];
}

export async function getFlagConfig(guildId) {
  const cacheKey = `flagConfig:${guildId}`;
  let config = configCache.get(cacheKey);
  
  if (config === undefined) {
    config = await FlagReactionConfig.findOne({ guildId, enabled: true }).lean();
    configCache.set(cacheKey, config || null);
  }
  
  return config;
}

export async function runCommandTranslation({
  guildId,
  userId,
  originalMessageId,
  sourceChannelId,
  featureType,
  text,
  targetLanguage,
}) {
  const replaced = await applyTextReplacements(guildId, text);
  const result = await translateText(replaced, null, targetLanguage);
  await incrementUsage(guildId, userId, result.translatedText.length, 1);
  await saveTranslationMap({
    guildId,
    featureType,
    originalMessageId,
    sourceChannelId,
    translatedMessageIds: [],
  });
  return result;
}
