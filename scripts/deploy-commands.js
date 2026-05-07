/**
 * Registers slash commands with Discord. Run after changing command definitions:
 *   npm run deploy-commands
 */
import { REST, Routes } from "discord.js";
import { loadConfig } from "../src/config.js";
import { commands } from "../src/commands/index.js";
import { logger } from "../src/utils/logger.js";

const config = loadConfig();
const rest = new REST({ version: "10" }).setToken(config.token);

const body = commands.map((c) => c.data.toJSON());

try {
  if (config.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body },
    );
    logger.info("Registered guild commands", { guildId: config.guildId });
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    logger.info("Registered global commands (can take up to ~1 hour to appear)");
  }
} catch (err) {
  const discordCode =
    err && typeof err === "object" && "code" in err ? err.code : undefined;
  const discordStatus =
    err && typeof err === "object" && "status" in err ? err.status : undefined;
  const raw =
    err && typeof err === "object" && "rawError" in err && err.rawError
      ? err.rawError
      : undefined;

  logger.error("Deploy failed", {
    message: err instanceof Error ? err.message : String(err),
    discordCode,
    httpStatus: discordStatus,
    rawError: raw,
    mode: config.guildId ? "guild" : "global",
    guildId: config.guildId ?? undefined,
  });

  if (discordCode === 50001 && config.guildId) {
    logger.error(
      "Hint: Missing Access on guild deploy usually means the bot is not in that server, DISCORD_GUILD_ID is wrong (must be server ID, not channel/user), or the invite lacked the applications.commands scope.",
    );
  }

  process.exit(1);
}
