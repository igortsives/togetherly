import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const VERSION_PREFIX = "v1:";

let cachedKey: Buffer | null = null;

export class OAuthTokenKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthTokenKeyError";
  }
}

export class OAuthTokenDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthTokenDecryptError";
  }
}

export function resetOAuthTokenKeyCache() {
  cachedKey = null;
}

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) {
    throw new OAuthTokenKeyError(
      "OAUTH_TOKEN_ENCRYPTION_KEY is required. Generate one with: openssl rand -base64 32"
    );
  }

  const trimmed = raw.trim();
  const decoded = Buffer.from(trimmed, "base64");

  if (decoded.length < KEY_BYTES) {
    throw new OAuthTokenKeyError(
      `OAUTH_TOKEN_ENCRYPTION_KEY must be at least 32 bytes of random data (base64-encoded). Got ${decoded.length} bytes. Generate one with: openssl rand -base64 32.`
    );
  }

  cachedKey = decoded.subarray(0, KEY_BYTES);
  return cachedKey;
}

export function encryptToken(plaintext: string): string {
  if (plaintext.length === 0) return plaintext;
  if (isEncrypted(plaintext)) return plaintext;

  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, ciphertext, tag]).toString("base64");
  return `${VERSION_PREFIX}${payload}`;
}

export function decryptToken(stored: string): string {
  if (stored.length === 0) return stored;
  if (!isEncrypted(stored)) {
    return stored;
  }

  const key = getEncryptionKey();
  const payload = Buffer.from(stored.slice(VERSION_PREFIX.length), "base64");

  if (payload.length < IV_BYTES + AUTH_TAG_BYTES + 1) {
    throw new OAuthTokenDecryptError("Encrypted payload is too short");
  }

  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(payload.length - AUTH_TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES, payload.length - AUTH_TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    return plaintext.toString("utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new OAuthTokenDecryptError(
      `Failed to decrypt OAuth token (key mismatch or corrupted ciphertext): ${reason}`
    );
  }
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(VERSION_PREFIX);
}
