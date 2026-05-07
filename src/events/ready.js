import { Events } from "discord.js";
import { logger } from "../utils/logger.js";

export const readyEvent = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    logger.info("Bot logged in", { tag: client.user?.tag, id: client.user?.id });
  },
};
