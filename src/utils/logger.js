/**
 * Small structured logger. Swap for pino/winston later if you need log shipping.
 */
const levelOrder = { debug: 0, info: 1, warn: 2, error: 3 };

const minLevel =
  levelOrder[process.env.LOG_LEVEL?.toLowerCase()] ?? levelOrder.info;

function log(level, msg, meta) {
  if (levelOrder[level] < minLevel) return;
  const line = meta !== undefined ? `${msg} ${JSON.stringify(meta)}` : msg;
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  const out = level === "error" ? console.error : console.log;
  out(`${prefix} ${line}`);
}

export const logger = {
  debug: (msg, meta) => log("debug", msg, meta),
  info: (msg, meta) => log("info", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  error: (msg, meta) => log("error", msg, meta),
};
