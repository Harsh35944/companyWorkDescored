import jwt from "jsonwebtoken";
import { CSRF_COOKIE, generateToken } from "./csrf.js";

const COOKIE = "dashboard_session";

export function sessionMiddleware(cfg) {
  return function parseSession(req, _res, next) {
    const raw = req.cookies?.[COOKIE];
    if (!raw) {
      req.discordUserId = null;
      return next();
    }
    try {
      const payload = jwt.verify(raw, cfg.jwtSecret);
      req.discordUserId =
        typeof payload.sub === "string" ? payload.sub : null;
    } catch {
      req.discordUserId = null;
    }
    next();
  };
}

export function setSessionCookie(res, cfg, discordUserId) {
  const token = jwt.sign({ sub: discordUserId }, cfg.jwtSecret, {
    expiresIn: Math.floor(cfg.sessionMaxAgeMs / 1000),
  });

  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: "lax",
    maxAge: cfg.sessionMaxAgeMs,
    path: "/",
  });

  const csrf = generateToken();
  res.cookie(CSRF_COOKIE, csrf, {
    httpOnly: false,
    secure: cfg.cookieSecure,
    sameSite: "lax",
    maxAge: cfg.sessionMaxAgeMs,
    path: "/",
  });
}

export function clearSessionCookie(res, cfg) {
  res.clearCookie(COOKIE, {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: "lax",
    path: "/",
  });
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: cfg.cookieSecure,
    sameSite: "lax",
    path: "/",
  });
}

export function requireAuth(req, res, next) {
  if (!req.discordUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
