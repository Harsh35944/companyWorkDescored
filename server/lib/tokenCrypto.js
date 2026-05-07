import crypto from "crypto";

const PREFIX = "enc:v1:";

function getKeyBuffer(rawKey) {
  const trimmed = rawKey.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  try {
    const b = Buffer.from(trimmed, "base64");
    if (b.length === 32) return b;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string | null | undefined} keyFromEnv
 */
export function parseTokenEncryptionKey(keyFromEnv) {
  if (!keyFromEnv?.trim()) return null;
  return getKeyBuffer(keyFromEnv);
}

/**
 * @param {string} plaintext
 * @param {Buffer} key32
 */
export function encryptToken(plaintext, key32) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key32, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

/**
 * @param {string} stored
 * @param {Buffer} key32
 * @returns {string}
 */
export function decryptToken(stored, key32) {
  if (!stored.startsWith(PREFIX)) {
    return stored;
  }
  const rest = stored.slice(PREFIX.length);
  const parts = rest.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key32, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

/**
 * @param {string} stored
 */
export function isEncryptedToken(stored) {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}
