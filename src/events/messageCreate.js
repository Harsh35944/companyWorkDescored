import { Events } from "discord.js";
import { logger } from "../utils/logger.js";
import { handleMessageCreate } from "../services/messagePipelines.js";

export const messageCreateEvent = {
  name: Events.MessageCreate,
  async execute(message) {
    logger.info("New message event", { author: message.author.tag, content: message.content });
    try {
      await handleMessageCreate(message);
    } catch (err) {
      logger.error("messageCreate pipeline failed", {
        guildId: message.guildId,
        messageId: message.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
