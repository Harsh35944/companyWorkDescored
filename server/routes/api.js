import { Router } from "express";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/session.js";
import { ensureFreshAccessToken } from "../lib/userTokens.js";
import { fetchDiscordUser } from "../lib/discordApi.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { logger } from "../lib/logger.js";
import {
  analyticsQuerySchema,
  autoTranslateConfigCreateSchema,
  autoTranslateConfigPatchSchema,
  botInviteBodySchema,
  flagReactionConfigPatchSchema,
  guildFeaturesPatchSchema,
  guildIdParamSchema,
  guildIdAndIdParamSchema,
  roleTranslateConfigCreateSchema,
  roleTranslateConfigPatchSchema,
  statsBodySchema,
  textReplacementCreateSchema,
  translateBanPatchSchema,
  userTranslateConfigCreateSchema,
  userTranslateConfigPatchSchema,
} from "../validation/schemas.js";
import {
  getGuildAnalytics,
  getGuildChannels,
  getGuildOverview,
  getGuildRoles,
  getGuildUserStats,
  getManageableGuilds,
  writeGuildStats,
  ensureGuildSettings,
} from "../services/guildService.js";
import { createBotInviteUrl } from "../services/authService.js";
import { AppError } from "../lib/errors.js";
import { loadManagedGuildForUser } from "../services/guildService.js";
import { GuildSettings } from "../models/GuildSettings.js";
import { AutoTranslateConfig } from "../models/AutoTranslateConfig.js";
import { RoleTranslateConfig } from "../models/RoleTranslateConfig.js";
import { FlagReactionConfig } from "../models/FlagReactionConfig.js";
import { TextReplacement } from "../models/TextReplacement.js";
import { TranslateBan } from "../models/TranslateBan.js";
import { UserTranslateConfig } from "../models/UserTranslateConfig.js";
import { SUPPORTED_LANGUAGES } from "../lib/languages.js";

/**
 * Middleware to fetch the user document once per request.
 */
async function injectUser(req, res, next) {
  if (!req.discordUserId) return next();
  const user = await User.findOne({ discordId: req.discordUserId });
  if (!user) return res.status(401).json({ error: "User not found" });
  req.user = user;
  next();
}

export function createApiRouter(cfg) {
  const r = Router();

  r.use(requireAuth);
  r.use(asyncHandler(injectUser));

  r.get(
    "/me",
    asyncHandler(async (req, res) => {
      const accessToken = await ensureFreshAccessToken(req.user, cfg);
      const me = await fetchDiscordUser(accessToken);
      res.json({
        id: me.id,
        username: me.username,
        discriminator: me.discriminator ?? "0",
        avatar: me.avatar ?? null,
      });
    }),
  );

  r.get(
    "/me/guilds",
    asyncHandler(async (req, res) => {
      const guilds = await getManageableGuilds(req.user, cfg);
      res.json({ guilds });
    }),
  );
  
  r.get(
    "/languages",
    asyncHandler(async (req, res) => {
      res.json({ languages: SUPPORTED_LANGUAGES });
    }),
  );

  r.get(
    "/guilds/:guildId/overview",
    validate({ params: guildIdParamSchema }),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const data = await getGuildOverview(cfg, req.user, guildId);
      if (!data) return res.status(403).json({ error: "Cannot access this guild" });
      res.json(data);
    }),
  );

  r.get(
    "/guilds/:guildId/features",
    validate({ params: guildIdParamSchema }),
    asyncHandler(async (req, res) => {
      await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      const settings = await ensureGuildSettings(req.params.guildId, req.user.discordId);
      logger.info("GET /features returned settings from DB", { guildId: req.params.guildId, features: settings.features });
      res.json({ settings });
    }),
  );

  r.patch(
    "/guilds/:guildId/features",
    validate({ params: guildIdParamSchema, body: guildFeaturesPatchSchema }),
    asyncHandler(async (req, res) => {
      await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      const { features, ...rest } = req.body;
      const update = { $set: { ...rest } };
      if (features) {
        for (const [key, val] of Object.entries(features)) {
          update.$set[`features.${key}`] = val;
        }
      }
      
      const settings = await GuildSettings.findOneAndUpdate(
        { guildId: req.params.guildId },
        update,
        { new: true, upsert: true },
      );

      logger.info("Guild features updated in DB", { guildId: req.params.guildId, features: settings.features });
      res.json({ settings });
    }),
  );

  r.get(
    "/guilds/:guildId/analytics",
    validate({ params: guildIdParamSchema, query: analyticsQuerySchema }),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const period = req.query.period;
      const metric =
        req.query.metric === "messages"
          ? "translatedMessages"
          : "translatedCharacters";
      const data = await getGuildAnalytics(cfg, req.user, guildId, period, metric);
      if (!data) return res.status(403).json({ error: "Cannot access this guild" });
      res.json(data);
    }),
  );

  r.get(
    "/guilds/:guildId/user-stats",
    validate({ params: guildIdParamSchema }),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const data = await getGuildUserStats(cfg, req.user, guildId);
      if (!data) return res.status(403).json({ error: "Cannot access this guild" });
      res.json({ users: data });
    }),
  );

  r.get(
    "/guilds/:guildId/channels",
    validate({ params: guildIdParamSchema }),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const data = await getGuildChannels(cfg, req.user, guildId);
      if (!data) return res.status(403).json({ error: "Cannot access this guild" });
      res.json({ channels: data });
    }),
  );

  r.get(
    "/guilds/:guildId/roles",
    validate({ params: guildIdParamSchema }),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const data = await getGuildRoles(cfg, req.user, guildId);
      if (!data) return res.status(403).json({ error: "Cannot access this guild" });
      res.json({ roles: data });
    }),
  );

  r.post(
    "/guilds/:guildId/stats",
    validate({ params: guildIdParamSchema, body: statsBodySchema }),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const ok = await writeGuildStats(
        cfg,
        req.user,
        guildId,
        req.body.translatedCharacters,
        req.body.translatedMessages,
      );
      if (!ok) return res.status(403).json({ error: "Cannot access this guild" });
      res.status(204).end();
    }),
  );

  r.post(
    "/auth/bot-invite-url",
    validate({ body: botInviteBodySchema }),
    asyncHandler(async (req, res) => {
      const url = await createBotInviteUrl(cfg, req.user, req.body.guildId);
      if (!url) {
        throw new AppError("Cannot manage this guild", { statusCode: 403 });
      }
      res.json({ url });
    }),
  );


  r.get(
    "/guilds/:guildId/auto-translate-configs",
    validate({ params: guildIdParamSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const items = await AutoTranslateConfig.find({ guildId: req.params.guildId })
        .sort({ createdAt: -1 })
        .lean();
      res.json({ items });
    }),
  );

  r.post(
    "/guilds/:guildId/auto-translate-configs",
    validate({ params: guildIdParamSchema, body: autoTranslateConfigCreateSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await AutoTranslateConfig.findOneAndUpdate(
        { guildId: req.params.guildId, name: req.body.name },
        { $set: req.body },
        { upsert: true, new: true },
      );
      res.status(201).json({ item });
    }),
  );

  r.patch(
    "/guilds/:guildId/auto-translate-configs/:id",
    validate({ params: guildIdAndIdParamSchema, body: autoTranslateConfigPatchSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await AutoTranslateConfig.findOneAndUpdate(
        { _id: req.params.id, guildId: req.params.guildId },
        { $set: req.body },
        { new: true },
      );
      if (!item) return res.status(404).json({ error: "Not found" });
      res.json({ item });
    }),
  );

  r.delete(
    "/guilds/:guildId/auto-translate-configs/:id",
    validate({ params: guildIdAndIdParamSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await AutoTranslateConfig.findOneAndDelete({
        _id: req.params.id,
        guildId: req.params.guildId,
      });
      if (!item) return res.status(404).json({ error: "Not found" });
      res.status(204).end();
    }),
  );

  r.get(
    "/guilds/:guildId/role-translate-configs",
    validate({ params: guildIdParamSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const items = await RoleTranslateConfig.find({ guildId: req.params.guildId }).lean();
      res.json({ items });
    }),
  );

  r.post(
    "/guilds/:guildId/role-translate-configs",
    validate({ params: guildIdParamSchema, body: roleTranslateConfigCreateSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await RoleTranslateConfig.findOneAndUpdate(
        { guildId: req.params.guildId, roleId: req.body.roleId },
        { $set: req.body },
        { upsert: true, new: true },
      );
      res.status(201).json({ item });
    }),
  );

  r.patch(
    "/guilds/:guildId/role-translate-configs/:id",
    validate({ params: guildIdAndIdParamSchema, body: roleTranslateConfigPatchSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await RoleTranslateConfig.findOneAndUpdate(
        { _id: req.params.id, guildId: req.params.guildId },
        { $set: req.body },
        { new: true },
      );
      if (!item) return res.status(404).json({ error: "Not found" });
      res.json({ item });
    }),
  );

  r.delete(
    "/guilds/:guildId/role-translate-configs/:id",
    validate({ params: guildIdAndIdParamSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await RoleTranslateConfig.findOneAndDelete({
        _id: req.params.id,
        guildId: req.params.guildId,
      });
      if (!item) return res.status(404).json({ error: "Not found" });
      res.status(204).end();
    }),
  );

  r.get(
    "/guilds/:guildId/flag-reaction-config",
    validate({ params: guildIdParamSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await FlagReactionConfig.findOne({ guildId: req.params.guildId }).lean();
      res.json({ item: item ?? null });
    }),
  );

  r.patch(
    "/guilds/:guildId/flag-reaction-config",
    validate({ params: guildIdParamSchema, body: flagReactionConfigPatchSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await FlagReactionConfig.findOneAndUpdate(
        { guildId: req.params.guildId },
        { $set: req.body },
        { upsert: true, new: true },
      );
      res.json({ item });
    }),
  );

  r.get(
    "/guilds/:guildId/text-replacements",
    validate({ params: guildIdParamSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const items = await TextReplacement.find({ guildId: req.params.guildId }).lean();
      res.json({ items });
    }),
  );

  r.post(
    "/guilds/:guildId/text-replacements",
    validate({ params: guildIdParamSchema, body: textReplacementCreateSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await TextReplacement.create({
        guildId: req.params.guildId,
        ...req.body,
      });
      res.status(201).json({ item });
    }),
  );

  r.delete(
    "/guilds/:guildId/text-replacements/:id",
    validate({ params: guildIdAndIdParamSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await TextReplacement.findOneAndDelete({
        _id: req.params.id,
        guildId: req.params.guildId,
      });
      if (!item) return res.status(404).json({ error: "Not found" });
      res.status(204).end();
    }),
  );

  r.get(
    "/guilds/:guildId/translate-ban",
    validate({ params: guildIdParamSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await TranslateBan.findOne({ guildId: req.params.guildId }).lean();
      res.json({ item: item ?? { guildId: req.params.guildId, userIds: [], roleIds: [] } });
    }),
  );

  r.patch(
    "/guilds/:guildId/translate-ban",
    validate({ params: guildIdParamSchema, body: translateBanPatchSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await TranslateBan.findOneAndUpdate(
        { guildId: req.params.guildId },
        { $set: req.body },
        { upsert: true, new: true },
      );
      res.json({ item });
    }),
  );

  r.get(
    "/guilds/:guildId/user-translate-configs",
    validate({ params: guildIdParamSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const items = await UserTranslateConfig.find({ guildId: req.params.guildId }).lean();
      res.json({ items });
    }),
  );

  r.post(
    "/guilds/:guildId/user-translate-configs",
    validate({ params: guildIdParamSchema, body: userTranslateConfigCreateSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await UserTranslateConfig.findOneAndUpdate(
        { guildId: req.params.guildId, userId: req.body.userId },
        { $set: req.body },
        { upsert: true, new: true },
      );
      res.status(201).json({ item });
    }),
  );

  r.delete(
    "/guilds/:guildId/user-translate-configs/:id",
    validate({ params: guildIdAndIdParamSchema }),
    asyncHandler(async (req, res) => {
      const managed = await loadManagedGuildForUser(req.user, req.params.guildId, cfg);
      if (!managed) return res.status(403).json({ error: "Cannot access this guild" });
      const item = await UserTranslateConfig.findOneAndDelete({
        _id: req.params.id,
        guildId: req.params.guildId,
      });
      if (!item) return res.status(404).json({ error: "Not found" });
      res.status(204).end();
    }),
  );

  return r;
}
