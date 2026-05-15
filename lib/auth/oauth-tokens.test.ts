import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OAuthTokenDecryptError,
  OAuthTokenKeyError,
  decryptToken,
  encryptToken,
  isEncrypted,
  resetOAuthTokenKeyCache
} from "./oauth-tokens";

// Valid base64-encoded 32-byte keys, generated once per test run.
// Equivalent to `openssl rand -base64 32`.
const TEST_KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");

describe("oauth-tokens encryption", () => {
  beforeEach(() => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = TEST_KEY;
    resetOAuthTokenKeyCache();
  });

  afterEach(() => {
    delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    resetOAuthTokenKeyCache();
  });

  describe("encryptToken / decryptToken roundtrip", () => {
    it("encrypts and decrypts a typical OAuth access token", () => {
      const plaintext = "ya29.a0Ad52N3-fake-access-token-with-typical-length-padding";
      const encrypted = encryptToken(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(decryptToken(encrypted)).toBe(plaintext);
    });

    it("produces a different ciphertext each time (random IV)", () => {
      const plaintext = "stable-input";
      const first = encryptToken(plaintext);
      const second = encryptToken(plaintext);
      expect(first).not.toBe(second);
      expect(decryptToken(first)).toBe(plaintext);
      expect(decryptToken(second)).toBe(plaintext);
    });

    it("handles empty string as a passthrough", () => {
      expect(encryptToken("")).toBe("");
      expect(decryptToken("")).toBe("");
    });

    it("handles long refresh tokens (1 KB)", () => {
      const plaintext = "x".repeat(1024);
      const encrypted = encryptToken(plaintext);
      expect(decryptToken(encrypted)).toBe(plaintext);
    });
  });

  describe("isEncrypted / version prefix", () => {
    it("encrypts with the v1: prefix", () => {
      const encrypted = encryptToken("hello");
      expect(encrypted.startsWith("v1:")).toBe(true);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("treats a value without v1: as plaintext (legacy passthrough)", () => {
      const legacyValue = "plaintext-from-before-encryption";
      expect(isEncrypted(legacyValue)).toBe(false);
      expect(decryptToken(legacyValue)).toBe(legacyValue);
    });

    it("does not double-encrypt an already-encrypted value", () => {
      const encrypted = encryptToken("hello");
      expect(encryptToken(encrypted)).toBe(encrypted);
    });
  });

  describe("decryption error cases", () => {
    it("throws OAuthTokenDecryptError when the key changes between encrypt and decrypt", () => {
      const plaintext = "secret";
      const encrypted = encryptToken(plaintext);

      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = OTHER_KEY;
      resetOAuthTokenKeyCache();

      expect(() => decryptToken(encrypted)).toThrow(OAuthTokenDecryptError);
    });

    it("throws OAuthTokenDecryptError when the payload has been tampered with", () => {
      const encrypted = encryptToken("secret");
      const tampered =
        encrypted.slice(0, -4) +
        (encrypted.slice(-4) === "AAAA" ? "BBBB" : "AAAA");

      expect(() => decryptToken(tampered)).toThrow(OAuthTokenDecryptError);
    });

    it("throws OAuthTokenDecryptError when the encrypted payload is too short", () => {
      expect(() => decryptToken("v1:abc")).toThrow(OAuthTokenDecryptError);
    });
  });

  describe("missing key", () => {
    it("throws OAuthTokenKeyError when OAUTH_TOKEN_ENCRYPTION_KEY is empty", () => {
      delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
      resetOAuthTokenKeyCache();
      expect(() => encryptToken("anything")).toThrow(OAuthTokenKeyError);
    });

    it("throws OAuthTokenKeyError on decrypt of encrypted value with no key set", () => {
      const encrypted = encryptToken("secret");
      delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
      resetOAuthTokenKeyCache();
      expect(() => decryptToken(encrypted)).toThrow(OAuthTokenKeyError);
    });

    it("does NOT need a key to passthrough an unencrypted legacy value", () => {
      delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
      resetOAuthTokenKeyCache();
      expect(decryptToken("legacy-plaintext")).toBe("legacy-plaintext");
    });

    it("throws OAuthTokenKeyError with the required-message when the env var is missing entirely", () => {
      delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
      resetOAuthTokenKeyCache();
      expect(() => encryptToken("anything")).toThrow(
        /OAUTH_TOKEN_ENCRYPTION_KEY is required/
      );
    });
  });

  describe("weak key rejection", () => {
    it("rejects a weak short key like 'password' and reports byte count", () => {
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "password";
      resetOAuthTokenKeyCache();

      // 'password' base64-decodes to 6 bytes ("\xa6\xab\x95\xb1\xeb\xdc"), which
      // is well below the 32-byte minimum. The previous SHA-256 fallback would
      // have silently masked this.
      expect(() => encryptToken("anything")).toThrow(OAuthTokenKeyError);
      expect(() => encryptToken("anything")).toThrow(
        /must be at least 32 bytes of random data \(base64-encoded\)\. Got 6 bytes\./
      );
      expect(() => encryptToken("anything")).toThrow(/openssl rand -base64 32/);
    });

    it("rejects an empty-after-trim key as missing, not as too-short", () => {
      // Whitespace-only env vars should hit the "required" path, not the
      // bytes-too-short path. This guards the precedence between the two checks.
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "   ";
      resetOAuthTokenKeyCache();

      expect(() => encryptToken("anything")).toThrow(OAuthTokenKeyError);
      expect(() => encryptToken("anything")).toThrow(
        /OAUTH_TOKEN_ENCRYPTION_KEY is required/
      );
    });

    it("accepts a real `openssl rand -base64 32`-style key", () => {
      const strongKey = randomBytes(32).toString("base64");
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = strongKey;
      resetOAuthTokenKeyCache();

      const plaintext = "ya29.example-token";
      const encrypted = encryptToken(plaintext);
      expect(isEncrypted(encrypted)).toBe(true);
      expect(decryptToken(encrypted)).toBe(plaintext);
    });
  });
});
