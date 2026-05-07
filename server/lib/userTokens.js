import {
  refreshAccessToken,
  fetchDiscordUser,
  fetchUserGuilds,
} from "./discordApi.js";
import { User } from "../models/User.js";
import {
  decryptToken,
  encryptToken,
  isEncryptedToken,
  parseTokenEncryptionKey,
} from "./tokenCrypto.js";

const GUILDS_CACHE_TTL_MS = 30_000;
const guildsCache = new Map();
const inFlightGuildRequests = new Map();

function expiresAtFromPayload(payload) {
  const sec = payload.expires_in ?? 604800;
  return new Date(Date.now() + sec * 1000);
}

function getTokenKey(cfg) {
  const key = parseTokenEncryptionKey(cfg.tokenEncryptionKey);
  if (!cfg.tokenEncryptionKey) return null;
  if (!key) {
    throw new Error("Invalid TOKEN_ENCRYPTION_KEY format");
  }
  return key;
}

function maybeEncrypt(token, cfg) {
  const key = getTokenKey(cfg);
  if (!key) return token;
  if (isEncryptedToken(token)) return token;
  return encryptToken(token, key);
}

function maybeDecrypt(token, cfg) {
  const key = getTokenKey(cfg);
  if (!key) return token;
  return decryptToken(token, key);
}

export async function ensureFreshAccessToken(userDoc, cfg) {
  const bufferMs = 60_000;
  if (userDoc.tokenExpiresAt.getTime() > Date.now() + bufferMs) {
    return maybeDecrypt(userDoc.accessToken, cfg);
  }

  const tokens = await refreshAccessToken({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    refreshToken: maybeDecrypt(userDoc.refreshToken, cfg),
  });

  userDoc.accessToken = maybeEncrypt(tokens.access_token, cfg);
  userDoc.refreshToken = maybeEncrypt(
    tokens.refresh_token ?? maybeDecrypt(userDoc.refreshToken, cfg),
    cfg,
  );
  userDoc.tokenExpiresAt = expiresAtFromPayload(tokens);
  await userDoc.save();

  return tokens.access_token;
}

export async function upsertUserFromOAuth(cfg, tokenPayload) {
  const accessToken = tokenPayload.access_token;
  const refreshToken = tokenPayload.refresh_token;
  const expiresAt = expiresAtFromPayload(tokenPayload);

  const me = await fetchDiscordUser(accessToken);

  return User.findOneAndUpdate(
    { discordId: me.id },
    {
      discordId: me.id,
      username: me.username,
      discriminator: me.discriminator ?? "0",
      avatar: me.avatar ?? null,
      accessToken: maybeEncrypt(accessToken, cfg),
      refreshToken: maybeEncrypt(refreshToken, cfg),
      tokenExpiresAt: expiresAt,
    },
    { upsert: true, new: true },
  );
}

export async function getFilteredGuildsForUser(userDoc, cfg) {
  const key = userDoc.discordId;
  const cached = guildsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.guilds;
  }

  const existing = inFlightGuildRequests.get(key);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    const accessToken = await ensureFreshAccessToken(userDoc, cfg);
    const guilds = await fetchUserGuilds(accessToken);
    guildsCache.set(key, {
      guilds,
      expiresAt: Date.now() + GUILDS_CACHE_TTL_MS,
    });
    return guilds;
  })();

  inFlightGuildRequests.set(key, request);

  try {
    return await request;
  } finally {
    inFlightGuildRequests.delete(key);
  }
}
