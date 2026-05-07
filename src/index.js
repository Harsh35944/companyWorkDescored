import { loadConfig } from "./config.js";
import { createClient } from "./bot/createClient.js";
import { readyEvent } from "./events/ready.js";
import { interactionCreateEvent } from "./events/interactionCreate.js";
import { messageCreateEvent } from "./events/messageCreate.js";
import { messageReactionAddEvent } from "./events/messageReactionAdd.js";
import { messageDeleteEvent } from "./events/messageDelete.js";
import { logger } from "./utils/logger.js";
import mongoose from "mongoose";

const config = loadConfig();
const client = createClient();

client.once(readyEvent.name, (...args) => readyEvent.execute(...args));
client.on(interactionCreateEvent.name, (...args) =>
  interactionCreateEvent.execute(...args),
);
client.on(messageCreateEvent.name, (...args) => messageCreateEvent.execute(...args));
client.on(messageReactionAddEvent.name, (...args) =>
  messageReactionAddEvent.execute(...args),
);
client.on(messageDeleteEvent.name, (...args) => messageDeleteEvent.execute(...args));

function shutdown(signal) {
  logger.info("Shutdown requested", { signal });
  Promise.resolve()
    .then(() => client.destroy())
    .then(() => mongoose.disconnect())
    .finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.stack : String(reason),
  });
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { message: err.message, stack: err.stack });
  process.exit(1);
});

try {
  await mongoose.connect(config.mongoUri);
  await client.login(config.token);
} catch (err) {
  logger.error("Login failed", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
}
