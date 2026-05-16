import { hashSync } from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() }
  }
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  EMAIL_RATE_LIMIT: { maxAttempts: 5, windowMs: 900_000 },
  IP_RATE_LIMIT: { maxAttempts: 20, windowMs: 900_000 },
  emailRateLimitKey: vi.fn((email: string) => `email:${email.toLowerCase()}`),
  ipRateLimitKey: vi.fn((ip: string) => `ip:${ip}`),
  ipFromRequest: vi.fn(() => "unknown"),
  isRateLimited: vi.fn(),
  recordFailedAttempt: vi.fn()
}));

import { prisma } from "@/lib/db/prisma";
import { isRateLimited, recordFailedAttempt } from "@/lib/auth/rate-limit";
import {
  BCRYPT_ROUNDS,
  credentialsAuthorize,
  redirectCallback,
  signInCallback,
  TIMING_DUMMY_HASH
} from "./callbacks";

const mockFindUnique = prisma.user.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const mockIsRateLimited = isRateLimited as unknown as ReturnType<typeof vi.fn>;
const mockRecordFailed = recordFailedAttempt as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.resetAllMocks();
  // Default rate-limit responses: not limited.
  mockIsRateLimited.mockResolvedValue({ limited: false, count: 0 });
  mockRecordFailed.mockResolvedValue(undefined);
});

// Note: `mapAuthProvider` is private to auth.ts; the
// microsoft-entra-id → MICROSOFT mapping is exercised end-to-end
// through the actual Microsoft sign-in flow. It is also asserted
// indirectly via the e2e expectation that the database stores
// AuthProvider.MICROSOFT for Microsoft sign-ups (manual smoke
// during PR validation).

describe("signInCallback", () => {
  it("rejects Google sign-ins when profile.email_verified is missing", async () => {
    expect(
      await signInCallback({
        account: { provider: "google", providerAccountId: "g-1" },
        profile: {}
      })
    ).toBe(false);
  });

  it("rejects Google sign-ins when profile.email_verified is false", async () => {
    expect(
      await signInCallback({
        account: { provider: "google", providerAccountId: "g-1" },
        profile: { email_verified: false }
      })
    ).toBe(false);
  });

  it("accepts Google sign-ins when profile.email_verified === true", async () => {
    expect(
      await signInCallback({
        account: { provider: "google", providerAccountId: "g-1" },
        profile: { email_verified: true }
      })
    ).toBe(true);
  });

  it("accepts non-Google providers without a profile gate", async () => {
    expect(
      await signInCallback({
        account: { provider: "credentials" }
      })
    ).toBe(true);
    expect(
      await signInCallback({
        account: { provider: "microsoft-entra-id" }
      })
    ).toBe(true);
    expect(
      await signInCallback({
        account: { provider: "apple" }
      })
    ).toBe(true);
  });

  it("accepts when account is missing entirely", async () => {
    expect(await signInCallback({})).toBe(true);
  });
});

describe("redirectCallback", () => {
  const baseUrl = "https://togetherly.example.com";

  it("returns the URL unchanged when it is same-origin", async () => {
    expect(
      await redirectCallback({ url: `${baseUrl}/review`, baseUrl })
    ).toBe(`${baseUrl}/review`);
  });

  it("resolves relative paths against the baseUrl", async () => {
    expect(await redirectCallback({ url: "/windows", baseUrl })).toBe(
      `${baseUrl}/windows`
    );
  });

  it("falls back to baseUrl on cross-origin URLs", async () => {
    expect(
      await redirectCallback({ url: "https://evil.com/phish", baseUrl })
    ).toBe(baseUrl);
  });
});

describe("credentialsAuthorize", () => {
  it("returns null on schema-invalid input", async () => {
    const result = await credentialsAuthorize(
      { email: "not-an-email", password: "x" },
      undefined
    );
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null and skips bcrypt when email rate-limited", async () => {
    mockIsRateLimited.mockResolvedValueOnce({ limited: true, count: 6 });
    const result = await credentialsAuthorize(
      { email: "user@example.com", password: "password123" },
      undefined
    );
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null and skips bcrypt when IP rate-limited", async () => {
    mockIsRateLimited
      .mockResolvedValueOnce({ limited: false, count: 0 }) // email
      .mockResolvedValueOnce({ limited: true, count: 21 }); // ip
    const result = await credentialsAuthorize(
      { email: "user@example.com", password: "password123" },
      undefined
    );
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null and records failure when user is missing (timing-channel close)", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await credentialsAuthorize(
      { email: "stranger@example.com", password: "password123" },
      undefined
    );
    expect(result).toBeNull();
    // Failure recorded on BOTH buckets even when user is missing.
    expect(mockRecordFailed).toHaveBeenCalledTimes(2);
  });

  it("returns null and records failure when password is wrong", async () => {
    mockFindUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "Alice",
      passwordHash:
        // A valid bcrypt hash that does NOT match "password123".
        TIMING_DUMMY_HASH
    });
    const result = await credentialsAuthorize(
      { email: "user@example.com", password: "password123" },
      undefined
    );
    expect(result).toBeNull();
    expect(mockRecordFailed).toHaveBeenCalledTimes(2);
  });

  it("returns the user shape on successful authenticate", async () => {
    const password = "correct-horse-battery-staple";
    const passwordHash = hashSync(password, BCRYPT_ROUNDS);
    mockFindUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "Alice",
      passwordHash,
      image: null
    });

    const result = await credentialsAuthorize(
      { email: "user@example.com", password },
      undefined
    );

    expect(result).toEqual({
      id: "user-1",
      email: "user@example.com",
      name: "Alice",
      image: undefined
    });
    expect(mockRecordFailed).not.toHaveBeenCalled();
  });
});
