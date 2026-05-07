import {
  AuthRedirectError,
  DiscordApiError,
  normalizeError,
} from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * @param {import('../config.js').ApiConfig} cfg
 */
export function createErrorHandler(cfg) {
  return function errorHandler(err, req, res, next) {
    if (res.headersSent) {
      next(err);
      return;
    }

    const reqId = req.requestId;

    if (err instanceof AuthRedirectError) {
      const url =
        err.kind === "bot_oauth"
          ? `${cfg.frontendUrl}/?error=bot_oauth`
          : `${cfg.frontendUrl}/?error=oauth`;
      logger.warn("auth redirect error", { reqId, kind: err.kind });
      res.redirect(url);
      return;
    }

    if (err instanceof DiscordApiError && err.status === 429) {
      logger.warn("discord rate limit", {
        reqId,
        path: req.path,
        retryAfterSec: err.retryAfterSec,
      });
      res.status(429).json({
        error: "Discord rate-limited guild fetch. Please retry shortly.",
        retryAfterSec:
          typeof err.retryAfterSec === "number" && Number.isFinite(err.retryAfterSec)
            ? err.retryAfterSec
            : 2,
      });
      return;
    }

    const appErr = normalizeError(err);
    const status = appErr.statusCode;

    if (status >= 500) {
      logger.error("request failed", {
        reqId,
        path: req.path,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } else {
      logger.info("request rejected", {
        reqId,
        path: req.path,
        status,
        message: appErr.message,
      });
    }

    res.status(status).json(appErr.toJSON());
  };
}
