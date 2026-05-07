import { Events } from "discord.js";
import { logger } from "../utils/logger.js";
import { handleMessageDelete } from "../services/messagePipelines.js";

export const messageDeleteEvent = {
  name: Events.MessageDelete,
  async execute(message) {
    try {
      await handleMessageDelete(message);
    } catch (err) {
      logger.error("messageDelete pipeline failed", {
        guildId: message.guildId,
        messageId: message.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
