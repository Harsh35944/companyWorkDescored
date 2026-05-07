const DISCORD_API = "https://discord.com/api/v10";
import { DiscordApiError } from "./errors.js";

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discordFetch(path, init = {}, opts = {}) {
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 8000;
  let lastErr;

  for (let i = 0; i < attempts; i += 1) {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(`${DISCORD_API}${path}`, {
        ...init,
        signal: ac.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return res;

      const bodyText = await res.text().catch(() => "");
      const retryAfterRaw = res.headers.get("retry-after");
      const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : null;

      const err = new DiscordApiError(`discord ${path} failed: ${bodyText}`, {
        status: res.status,
        retryAfterSec: Number.isFinite(retryAfterSec) ? retryAfterSec : null,
      });

      if (RETRYABLE_STATUS.has(res.status) && i < attempts - 1) {
        const waitMs =
          typeof err.retryAfterSec === "number"
            ? err.retryAfterSec * 1000
            : 250 * 2 ** i;
        await sleep(waitMs);
        continue;
      }
      throw err;
    } catch (err) {
      clearTimeout(timeout);
      if (
        i < attempts - 1 &&
        (err.name === "AbortError" || err instanceof TypeError)
      ) {
        await sleep(250 * 2 ** i);
        continue;
      }
      lastErr = err;
      break;
    }
  }
  throw lastErr;
}

export async function exchangeCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
}) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const res = await discordFetch("/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  return res.json();
}

export async function refreshAccessToken({
  clientId,
  clientSecret,
  refreshToken,
}) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await discordFetch("/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  return res.json();
}

export async function fetchDiscordUser(accessToken) {
  const res = await discordFetch("/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export async function fetchUserGuilds(accessToken) {
  const res = await discordFetch("/users/@me/guilds", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export async function fetchGuildWithCounts(botToken, guildId) {
  const res = await discordFetch(`/guilds/${guildId}?with_counts=true`, {
    headers: { Authorization: `Bot ${botToken}` },
  });
  return res.json();
}

export async function fetchGuildChannels(botToken, guildId) {
  const res = await discordFetch(`/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${botToken}` },
  });
  return res.json();
}

export async function fetchGuildRoles(botToken, guildId) {
  const res = await discordFetch(`/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${botToken}` },
  });
  return res.json();
}
