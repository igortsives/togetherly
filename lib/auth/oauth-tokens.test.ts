import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OAuthTokenDecryptError,
  OAuthTokenKeyError,
  decryptToken,
  encryptToken,
  isEncrypted,
  resetOAuthTokenKeyCache
} from "./oauth-tokens";

const TEST_KEY = "test-encryption-key-for-vitest-32bytes-long-padding-here";
const OTHER_KEY = "completely-different-key-for-mismatch-tests-32bytes-here";

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
  });
});
