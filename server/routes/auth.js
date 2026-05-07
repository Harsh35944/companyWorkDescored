import { Router } from "express";
import crypto from "crypto";
import { exchangeCode } from "../lib/discordApi.js";
import { upsertUserFromOAuth } from "../lib/userTokens.js";
import {
  clearSessionCookie,
  setSessionCookie,
} from "../middleware/session.js";
import { PendingBotOAuth } from "../models/PendingBotOAuth.js";
import { GuildInstallation } from "../models/GuildInstallation.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { AuthRedirectError } from "../lib/errors.js";

const LOGIN_STATE_COOKIE = "oauth_login_state";
const LOGIN_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function discordAuthorizeUrl(cfg, state) {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "identify guilds",
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function createAuthRouter(cfg) {
  const r = Router();

  r.get("/discord/login", (_req, res) => {
    const state = crypto.randomBytes(24).toString("hex");
    res.cookie(LOGIN_STATE_COOKIE, state, {
      httpOnly: true,
      secure: cfg.cookieSecure,
      sameSite: "lax",
      maxAge: LOGIN_STATE_MAX_AGE_MS,
      path: "/",
    });
    res.redirect(discordAuthorizeUrl(cfg, state));
  });

  r.get(
    "/discord/callback",
    asyncHandler(async (req, res) => {
      const { code, state } = req.query;
      const saved = req.cookies?.[LOGIN_STATE_COOKIE];
      res.clearCookie(LOGIN_STATE_COOKIE, {
        httpOnly: true,
        secure: cfg.cookieSecure,
        sameSite: "lax",
        path: "/",
      });

      if (
        !code ||
        typeof code !== "string" ||
        !state ||
        typeof state !== "string" ||
        !saved ||
        state !== saved
      ) {
        throw new AuthRedirectError("oauth");
      }

      const tokens = await exchangeCode({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        code,
        redirectUri: cfg.redirectUri,
      });

      const user = await upsertUserFromOAuth(cfg, tokens);
      setSessionCookie(res, cfg, user.discordId);

      const qp = new URLSearchParams({
        login: "success",
        username: user.username ?? "",
      });
      return res.redirect(`${cfg.frontendUrl}/?${qp.toString()}`);
    }),
  );

  r.post("/logout", (_req, res) => {
    clearSessionCookie(res, cfg);
    res.status(204).end();
  });

  r.get(
    "/bot/callback",
    asyncHandler(async (req, res) => {
      const { code, state, guild_id: guildIdQuery } = req.query;

      if (
        !code ||
        typeof code !== "string" ||
        !state ||
        typeof state !== "string"
      ) {
        throw new AuthRedirectError("bot_oauth");
      }

      const pending = await PendingBotOAuth.findOne({ state });
      if (!pending) {
        throw new AuthRedirectError("bot_oauth");
      }

      await exchangeCode({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        code,
        redirectUri: cfg.botRedirectUri,
      });

      const guildId =
        typeof guildIdQuery === "string" && guildIdQuery
          ? guildIdQuery
          : pending.guildId;

      if (guildId !== pending.guildId) {
        await PendingBotOAuth.deleteOne({ _id: pending._id });
        throw new AuthRedirectError("bot_oauth");
      }

      await GuildInstallation.findOneAndUpdate(
        { guildId },
        {
          guildId,
          installerDiscordId: pending.discordUserId,
          installedAt: new Date(),
        },
        { upsert: true, new: true },
      );

      await PendingBotOAuth.deleteOne({ _id: pending._id });

      const qp = new URLSearchParams({ bot_installed: guildId });
      return res.redirect(`${cfg.frontendUrl}/?${qp.toString()}`);
    }),
  );

  return r;
}
