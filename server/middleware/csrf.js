import crypto from "crypto";

export const CSRF_COOKIE = "csrf_token";

export function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

const CSRF_HEADER = "x-csrf-token";

/**
 * Ensures authenticated sessions have a readable CSRF cookie (double-submit).
 */
export function ensureCsrfCookieMiddleware(cfg) {
  return function ensureCsrfCookie(req, res, next) {
    if (!req.discordUserId) {
      return next();
    }
    if (req.cookies?.[CSRF_COOKIE]) {
      return next();
    }
    const token = generateToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: cfg.cookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    next();
  };
}

/**
 * Validates CSRF for mutating API requests when using cookie sessions.
 */
export function csrfProtectionMiddleware(cfg) {
  return function csrfProtection(req, res, next) {
    const method = req.method.toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return next();
    }

    const origin = req.get("origin");
    if (origin && origin !== cfg.frontendUrl) {
      return res.status(403).json({ error: "Invalid CSRF origin" });
    }

    const header = req.get(CSRF_HEADER);
    const cookie = req.cookies?.[CSRF_COOKIE];
    if (
      typeof header === "string" &&
      header.length > 0 &&
      typeof cookie === "string" &&
      cookie.length > 0 &&
      header === cookie
    ) {
      return next();
    }

    return res.status(403).json({ error: "Invalid CSRF token" });
  };
}
