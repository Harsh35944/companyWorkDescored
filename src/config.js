/**
 * Loads and validates environment variables. Fails fast if required vars are missing.
 */
import dotenv from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: resolve(repoRoot, ".env") });

const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "MONGODB_URI"];

export function loadConfig() {
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env and set values.`,
    );
  }

  return {
    token: process.env.DISCORD_TOKEN.trim(),
    clientId: process.env.DISCORD_CLIENT_ID.trim(),
    /** If set, slash commands register only on this guild (good for development). */
    guildId: process.env.DISCORD_GUILD_ID?.trim() || null,
    mongoUri: process.env.MONGODB_URI.trim(),
  };
}
