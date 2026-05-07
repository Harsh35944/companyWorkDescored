import { GuildInstallation } from "../models/GuildInstallation.js";
import { GuildSettings } from "../models/GuildSettings.js";
import { GuildStatsDaily } from "../models/GuildStatsDaily.js";
import { GuildStatsHourly } from "../models/GuildStatsHourly.js";
import { GuildSnapshotCache } from "../models/GuildSnapshotCache.js";
import { getFilteredGuildsForUser } from "../lib/userTokens.js";
import { fetchGuildChannels, fetchGuildWithCounts, fetchGuildRoles } from "../lib/discordApi.js";
import { canConfigureGuild } from "../lib/guildPermissions.js";
import { UserGuildStats } from "../models/UserGuildStats.js";
import { User } from "../models/User.js";

const SNAPSHOT_TTL_MS = 2 * 60_000;

export function guildIconUrl(guildId, iconHash) {
  if (!iconHash) return null;
  const ext = iconHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}`;
}

export function toUtcDayString(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function hourBucketDate(d) {
  const out = new Date(d);
  out.setUTCMinutes(0, 0, 0);
  return out;
}

export function rangeStart(period) {
  const now = Date.now();
  if (period === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (period === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  return new Date(now - 24 * 60 * 60 * 1000);
}

export async function loadManagedGuildForUser(user, guildId, cfg) {
  const rawGuilds = await getFilteredGuildsForUser(user, cfg);
  const match = rawGuilds.find((g) => g.id === guildId);
  if (!match) return null;

  if (!canConfigureGuild(match.owner, match.permissions)) {
    return null;
  }
  return match;
}

export async function getManageableGuilds(user, cfg) {
  const rawGuilds = await getFilteredGuildsForUser(user, cfg);
  const manageable = rawGuilds.filter((g) =>
    canConfigureGuild(g.owner, g.permissions),
  );
  const installations = await GuildInstallation.find({
    guildId: { $in: manageable.map((g) => g.id) },
  }).lean();
  const settings = await GuildSettings.find({
    guildId: { $in: manageable.map((g) => g.id) },
  }).lean();

  const installedSet = new Set(installations.map((i) => i.guildId));
  const planByGuild = new Map(settings.map((s) => [s.guildId, s.plan]));
  return manageable.map((g) => ({
    id: g.id,
    name: g.name,
    iconUrl: guildIconUrl(g.id, g.icon),
    owner: g.owner,
    botConfigured: installedSet.has(g.id),
    plan: planByGuild.get(g.id) || cfg.defaultPlan,
  }));
}

export async function ensureGuildSettings(guildId, ownerDiscordId) {
  let settings = await GuildSettings.findOne({ guildId });
  if (!settings) {
    settings = await GuildSettings.create({ guildId, ownerDiscordId });
  }
  return settings;
}

export async function ensureGuildSnapshot(cfg, guildId, fallbackName, fallbackIcon) {
  const existing = await GuildSnapshotCache.findOne({ guildId });
  if (existing && Date.now() - existing.fetchedAt.getTime() < SNAPSHOT_TTL_MS) {
    return existing;
  }

  if (!cfg.botToken) {
    return (
      existing ||
      GuildSnapshotCache.create({
        guildId,
        guildName: fallbackName,
        icon: fallbackIcon,
      })
    );
  }

  try {
    const guild = await fetchGuildWithCounts(cfg.botToken, guildId);
    const channels = await fetchGuildChannels(cfg.botToken, guildId);

    const categoryCount = channels.filter((c) => c.type === 4).length;

    return GuildSnapshotCache.findOneAndUpdate(
      { guildId },
      {
        guildId,
        guildName: guild.name ?? fallbackName,
        icon: guild.icon ?? fallbackIcon,
        memberCount: guild.approximate_member_count ?? 0,
        channelCount: channels.length,
        categoryCount,
        roleCount: Array.isArray(guild.roles) ? guild.roles.length : 0,
        fetchedAt: new Date(),
      },
      { upsert: true, new: true },
    );
  } catch {
    return (
      existing ||
      GuildSnapshotCache.create({
        guildId,
        guildName: fallbackName,
        icon: fallbackIcon,
      })
    );
  }
}

export async function getGuildOverview(cfg, user, guildId) {
  const managed = await loadManagedGuildForUser(user, guildId, cfg);
  if (!managed) return null;

  const settings = await ensureGuildSettings(guildId, user.discordId);
  const snapshot = await ensureGuildSnapshot(cfg, guildId, managed.name, managed.icon);
  const today = toUtcDayString(new Date());
  const daily =
    (await GuildStatsDaily.findOne({ guildId, day: today }).lean()) ||
    ({ translatedCharacters: 0, translatedMessages: 0 });

  return {
    guild: {
      id: guildId,
      name: snapshot.guildName || managed.name,
      iconUrl: guildIconUrl(guildId, snapshot.icon || managed.icon),
      plan: settings.plan,
      botConfigured: Boolean(
        await GuildInstallation.findOne({ guildId }).select("_id").lean(),
      ),
    },
    counts: {
      members: snapshot.memberCount,
      channels: snapshot.channelCount,
      categories: snapshot.categoryCount,
      roles: snapshot.roleCount,
    },
    quota: {
      usedCharacters: daily.translatedCharacters || 0,
      maxCharacters: settings.maxCharactersPerDay || cfg.defaultMaxCharactersPerDay,
    },
    summary: {
      translatedCharacters: daily.translatedCharacters || 0,
      translatedMessages: daily.translatedMessages || 0,
    },
  };
}

export async function getGuildAnalytics(cfg, user, guildId, period, metric) {
  const managed = await loadManagedGuildForUser(user, guildId, cfg);
  if (!managed) return null;
  const start = rangeStart(period);
  const points = [];

  if (period === "24h") {
    const rows = await GuildStatsHourly.find({
      guildId,
      hourBucket: { $gte: hourBucketDate(start) },
    })
      .sort({ hourBucket: 1 })
      .lean();

    for (const row of rows) {
      points.push({ ts: row.hourBucket, value: row[metric] || 0 });
    }
  } else {
    const startDay = toUtcDayString(start);
    const rows = await GuildStatsDaily.find({ guildId, day: { $gte: startDay } })
      .sort({ day: 1 })
      .lean();
    for (const row of rows) {
      points.push({ ts: row.day, value: row[metric] || 0 });
    }
  }

  const total = points.reduce((sum, p) => sum + p.value, 0);
  return { guildId, period, metric, total, points };
}

export async function getGuildUserStats(cfg, user, guildId) {
  const managed = await loadManagedGuildForUser(user, guildId, cfg);
  if (!managed) return null;

  const stats = await UserGuildStats.aggregate([
    { $match: { guildId } },
    {
      $group: {
        _id: "$userId",
        translatedCharacters: { $sum: "$translatedCharacters" },
        translatedMessages: { $sum: "$translatedMessages" },
      },
    },
    { $sort: { translatedCharacters: -1 } },
    { $limit: 20 },
  ]);

  const userIds = stats.map((s) => s._id);
  const users = await User.find({ discordId: { $in: userIds } }).lean();
  const userMap = new Map(users.map((u) => [u.discordId, u]));

  return stats.map((s) => ({
    userId: s._id,
    username: userMap.get(s._id)?.username || "Unknown",
    avatar: userMap.get(s._id)?.avatar || null,
    translatedCharacters: s.translatedCharacters,
    translatedMessages: s.translatedMessages,
  }));
}

export async function writeGuildStats(cfg, user, guildId, translatedCharacters, translatedMessages) {
  const managed = await loadManagedGuildForUser(user, guildId, cfg);
  if (!managed) return false;

  const now = new Date();
  await GuildStatsDaily.findOneAndUpdate(
    { guildId, day: toUtcDayString(now) },
    { $inc: { translatedCharacters, translatedMessages } },
    { upsert: true, new: true },
  );
  await GuildStatsHourly.findOneAndUpdate(
    { guildId, hourBucket: hourBucketDate(now) },
    { $inc: { translatedCharacters, translatedMessages } },
    { upsert: true, new: true },
  );
  return true;
}

export async function getGuildChannels(cfg, user, guildId) {
  const managed = await loadManagedGuildForUser(user, guildId, cfg);
  if (!managed) return null;

  const channels = await fetchGuildChannels(cfg.botToken, guildId);
  return channels
    .filter((c) => [0, 2, 4, 5, 13, 15].includes(c.type)) // Text, Voice, Category, News, etc.
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
    }));
}

export async function getGuildRoles(cfg, user, guildId) {
  const managed = await loadManagedGuildForUser(user, guildId, cfg);
  if (!managed) return null;

  const roles = await fetchGuildRoles(cfg.botToken, guildId);
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
  }));
}
