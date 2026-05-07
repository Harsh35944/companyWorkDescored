import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { sessionMiddleware } from "./middleware/session.js";
import { createAuthRouter } from "./routes/auth.js";
import { createApiRouter } from "./routes/api.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { createErrorHandler } from "./middleware/errorHandler.js";
import {
  csrfProtectionMiddleware,
  ensureCsrfCookieMiddleware,
} from "./middleware/csrf.js";
import { logger } from "./lib/logger.js";

/**
 * @param {import("./config.js").ApiConfig} cfg
 * @param {{ readinessProbe?: () => boolean }} [deps]
 */
export function createApp(cfg, deps = {}) {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(
    cors({
      origin: cfg.frontendUrl,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cookieParser());
  app.use(express.json({ limit: `${cfg.jsonBodyLimitMb}mb` }));
  app.use(sessionMiddleware(cfg));
  app.use(ensureCsrfCookieMiddleware(cfg));

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      logger.info("request", {
        reqId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        userId: req.discordUserId ?? null,
        durationMs: Date.now() - start,
      });
    });
    next();
  });

  const writeLimiter = rateLimit({
    windowMs: 60_000,
    max: cfg.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please retry shortly." },
  });

  app.use("/api/auth", createAuthRouter(cfg));
  app.use("/api", csrfProtectionMiddleware(cfg), writeLimiter);
  app.use("/api", createApiRouter(cfg));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/readiness", (_req, res) => {
    const ready = deps.readinessProbe ? deps.readinessProbe() : true;
    if (!ready) {
      return res.status(503).json({ ok: false });
    }
    return res.json({ ok: true });
  });

  app.use(createErrorHandler(cfg));
  return app;
}
