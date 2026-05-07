import crypto from "crypto";

const HEADER = "x-request-id";

export function requestIdMiddleware(req, res, next) {
  const incoming = req.headers[HEADER];
  const id =
    typeof incoming === "string" && incoming.trim().length > 0
      ? incoming.trim().slice(0, 128)
      : crypto.randomUUID();
  req.requestId = id;
  res.setHeader(HEADER, id);
  next();
}
