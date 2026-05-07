import crypto from "crypto";
import { PendingBotOAuth } from "../models/PendingBotOAuth.js";
import { getFilteredGuildsForUser } from "../lib/userTokens.js";
import { canConfigureGuild } from "../lib/guildPermissions.js";

export async function createBotInviteUrl(cfg, user, guildId) {
  const rawGuilds = await getFilteredGuildsForUser(user, cfg);
  const match = rawGuilds.find((g) => g.id === guildId);
  if (!match || !canConfigureGuild(match.owner, match.permissions)) {
    return null;
  }

  const state = crypto.randomBytes(24).toString("hex");
  await PendingBotOAuth.create({
    state,
    discordUserId: user.discordId,
    guildId,
  });

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.botRedirectUri,
    response_type: "code",
    scope: "bot applications.commands",
    permissions: cfg.botPermissions,
    guild_id: guildId,
    disable_guild_select: "true",
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
