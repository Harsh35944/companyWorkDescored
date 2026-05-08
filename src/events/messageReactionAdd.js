import { Events } from "discord.js";
import { logger } from "../utils/logger.js";
import { handleFlagReaction, handleAutoReact } from "../services/messagePipelines.js";

export const messageReactionAddEvent = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    try {
      await Promise.all([
        handleFlagReaction(reaction, user),
        handleAutoReact(reaction, user),
      ]);
    } catch (err) {
      logger.error("messageReactionAdd pipeline failed", {
        guildId: reaction.message?.guildId,
        messageId: reaction.message?.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
