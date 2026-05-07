import dotenv from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: resolve(repoRoot, ".env") });

const required = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_REDIRECT_URI",
  "DISCORD_BOT_REDIRECT_URI",
  "FRONTEND_URL",
  "JWT_SECRET",
  "MONGODB_URI",
];

/**
 * @typedef {object} ApiConfig
 * @property {string | null} botToken
 * @property {string} clientId
 * @property {string} clientSecret
 * @property {string} redirectUri
 * @property {string} botRedirectUri
 * @property {string} frontendUrl
 * @property {string} jwtSecret
 * @property {string} mongoUri
 * @property {string} botPermissions
 * @property {number} port
 * @property {boolean} cookieSecure
 * @property {string | null} tokenEncryptionKey
 * @property {number} jsonBodyLimitMb
 * @property {number} defaultMaxCharactersPerDay
 * @property {string} defaultPlan
 * @property {number} sessionMaxAgeMs
 * @property {number} rateLimitMax
 */

export function loadApiConfig() {
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Dashboard API missing env: ${missing.join(", ")}. See .env.example.`,
    );
  }

  const botPerms =
    process.env.DISCORD_BOT_PERMISSIONS?.trim() || "277025508352";

  return {
    botToken: process.env.DISCORD_TOKEN?.trim() || null,
    clientId: process.env.DISCORD_CLIENT_ID.trim(),
    clientSecret: process.env.DISCORD_CLIENT_SECRET.trim(),
    redirectUri: process.env.DISCORD_REDIRECT_URI.trim(),
    botRedirectUri: process.env.DISCORD_BOT_REDIRECT_URI.trim(),
    frontendUrl: process.env.FRONTEND_URL.trim(),
    jwtSecret: process.env.JWT_SECRET.trim(),
    mongoUri: process.env.MONGODB_URI.trim(),
    botPermissions: botPerms,
    port: Number(process.env.API_PORT || 4000),
    cookieSecure: process.env.COOKIE_SECURE === "true",
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY?.trim() || null,
    jsonBodyLimitMb: Number(process.env.API_JSON_LIMIT_MB || 1),
    defaultMaxCharactersPerDay: Number(process.env.DEFAULT_MAX_CHARS_PER_DAY || 10000),
    defaultPlan: process.env.DEFAULT_PLAN || "free",
    sessionMaxAgeMs: Number(process.env.SESSION_MAX_AGE_MS || 7 * 24 * 60 * 60 * 1000),
    rateLimitMax: Number(process.env.API_RATE_LIMIT_MAX || 120),
  };
}
