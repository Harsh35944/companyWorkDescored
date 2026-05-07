import mongoose from "mongoose";
import { loadApiConfig } from "./config.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";

const cfg = loadApiConfig();
let shuttingDown = false;

await mongoose.connect(cfg.mongoUri);

const app = createApp(cfg, {
  readinessProbe: () =>
    !shuttingDown && mongoose.connection.readyState === mongoose.STATES.connected,
});
const server = app.listen(cfg.port, () => {
  logger.info("api listening", { port: cfg.port });
});

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("shutdown started", { signal });

  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  logger.info("shutdown complete", { signal });
  process.exit(0);
}

process.on("SIGINT", () => {
  gracefulShutdown("SIGINT").catch((err) => {
    logger.error("shutdown failed", { signal: "SIGINT", message: err.message });
    process.exit(1);
  });
});
process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM").catch((err) => {
    logger.error("shutdown failed", { signal: "SIGTERM", message: err.message });
    process.exit(1);
  });
});
