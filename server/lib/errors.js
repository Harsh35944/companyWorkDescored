import { ZodError } from "zod";

export class AppError extends Error {
  /**
   * @param {string} message
   * @param {{ statusCode?: number, code?: string, details?: unknown }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = opts.statusCode ?? 500;
    this.code = opts.code;
    this.details = opts.details;
  }

  toJSON() {
    const body = { error: this.message };
    if (this.code) body.code = this.code;
    if (this.details !== undefined) body.details = this.details;
    return body;
  }
}

export class DiscordApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, retryAfterSec?: number | null }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = "DiscordApiError";
    this.status = meta.status;
    this.retryAfterSec = meta.retryAfterSec ?? null;
  }
}

/** OAuth HTML redirect targets (handled by error middleware). */
export class AuthRedirectError extends Error {
  /**
   * @param {"oauth" | "bot_oauth"} kind
   */
  constructor(kind) {
    super(`Auth flow failed: ${kind}`);
    this.name = "AuthRedirectError";
    this.kind = kind;
  }
}

/**
 * @param {unknown} err
 * @returns {AppError}
 */
export function normalizeError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof DiscordApiError) {
    return new AppError(err.message, { statusCode: err.status || 500 });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const msg = first?.message || "Validation failed";
    return new AppError(msg, { statusCode: 400, code: "VALIDATION_ERROR" });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return new AppError("Invalid JSON", { statusCode: 400 });
  }
  if (err instanceof Error) {
    return new AppError(err.message, { statusCode: 500 });
  }
  return new AppError("Internal server error", { statusCode: 500 });
}
